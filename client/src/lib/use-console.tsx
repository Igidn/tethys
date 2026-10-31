import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type {
  Agent,
  Command,
  EventRecord,
  Role,
  Snapshot,
  State,
  TurtleRole,
} from "./types";

const TOKEN_KEY = "tethys.console.token";

export type ConsoleStatus = "booting" | "live" | "offline" | "unauthorized";
export type CommandOp = "startJob" | "abort" | "returnHome" | "ping";

type UpdateAgent = { label?: string; role?: Role };

type ConsoleContextValue = {
  snapshot: State | null;
  status: ConsoleStatus;
  token: string;
  setToken: (token: string) => void;
  lastSync: number;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  refresh: () => Promise<void>;
  command: (agentId: string, op: CommandOp, name?: string) => Promise<boolean>;
  updateTurtle: (agentId: string, patch: UpdateAgent) => Promise<boolean>;
  isPending: (agentId: string, op: CommandOp) => boolean;
  exportUrl: () => string;
};

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

function readUrlToken(): string {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token") ?? "";
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
    }
    return token;
  } catch {
    return "";
  }
}

function readStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

const commandCopy: Record<CommandOp, string> = {
  startJob: "Job started",
  abort: "Abort sent",
  returnHome: "Return home sent",
  ping: "Ping sent",
};

// Map a tethys State into the cc-util-style Snapshot the UI components expect.
function toSnapshot(state: State): Snapshot {
  const online = new Set(state.agents.filter((a) => a.online).map((a) => a.id));
  const miners = state.agents.filter((a) => a.role === "mining").length;
  return {
    serverTime: state.serverTime,
    tunnelUrl: state.tunnel?.url ?? null,
    online: Array.from(online),
    config: state.config,
    counts: {
      turtles: state.agents.length,
      online: state.agents.filter((a) => a.online).length,
      miners,
      lumberjacks: 0,
      haulers: 0,
      stationBuilders: 0,
      activeMissions: 0,
      pausedMissions: 0,
      failedMissions: 0,
      ores: 0,
      blocks: 0,
      trips: 0,
    },
    turtles: state.agents,
    stations: [],
    missions: [],
    events: [], // events come from /api/events separately
    ores: [],
    oreRecent: [],
    oreCounts: {},
    chests: [],
    requests: [],
    shaftLocks: [],
  };
}

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState(() => readUrlToken() || readStoredToken());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<ConsoleStatus>("booting");
  const [lastSync, setLastSync] = useState(0);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const esRef = useRef<EventSource | null>(null);

  const setToken = useCallback((next: string) => {
    const clean = next.trim();
    try {
      if (clean) localStorage.setItem(TOKEN_KEY, clean);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private browsing */
    }
    setTokenState(clean);
    setSnapshot(null);
    setStatus("booting");
  }, []);

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      if (typeof init.body === "string" && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      const response = await fetch(path, { ...init, headers });
      if (response.status === 401) setStatus("unauthorized");
      return response;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch("/api/state");
      if (response.status === 401) {
        setStatus("unauthorized");
        return;
      }
      if (!response.ok) throw new Error(`state request failed (${response.status})`);
      const data = (await response.json()) as State;
      setSnapshot(toSnapshot(data));
      setLastSync(Date.now());
      setStatus("live");
    } catch {
      setStatus((current) => (current === "unauthorized" ? current : "offline"));
    }
  }, [apiFetch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // SSE stream for live state updates (replaces Socket.IO)
  useEffect(() => {
    if (!token) return;

    const eventSource = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    esRef.current = eventSource;

    eventSource.onopen = () => setStatus("live");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as State;
        setSnapshot(toSnapshot(data));
        setLastSync(Date.now());
        setStatus("live");
      } catch {
        // ignore malformed frames
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
      esRef.current = null;
      setStatus((current) => (current === "unauthorized" ? current : "offline"));
    };

    return () => {
      eventSource.close();
      esRef.current = null;
    };
  }, [token]);

  // Fallback poll when SSE is disconnected
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!esRef.current) void refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const command = useCallback(
    async (agentId: string, op: CommandOp, name?: string) => {
      const key = `${agentId}:${op}`;
      setPending((current) => new Set(current).add(key));
      try {
        let path = "";
        let method = "POST";
        let body: unknown = undefined;

        if (op === "startJob") {
          path = `/api/agents/${encodeURIComponent(agentId)}/jobs`;
          body = {};
        } else if (op === "abort") {
          path = `/api/jobs/${encodeURIComponent(agentId)}/abort`;
        } else if (op === "returnHome") {
          path = `/api/agents/${encodeURIComponent(agentId)}/return-home`;
        } else if (op === "ping") {
          path = `/api/agents/${encodeURIComponent(agentId)}/ping`;
        }

        const response = await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
        const payload = (await response.json().catch(() => ({ ok: false }))) as {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? `request failed (${response.status})`);
        }
        toast.success(commandCopy[op], {
          description: name ? `${name} · delivered to the agent when connected` : undefined,
        });
        return true;
      } catch (error) {
        toast.error("Command not sent", { description: (error as Error).message });
        return false;
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [apiFetch],
  );

  const updateTurtle = useCallback(
    async (agentId: string, patch: UpdateAgent) => {
      const field = patch.role !== undefined ? "role" : "label";
      const body = field === "role" ? { role: patch.role } : { label: patch.label ?? "" };
      try {
        const response = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/${field === "role" ? "role" : "config"}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({ ok: false }))) as {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? `request failed (${response.status})`);
        }
        toast.success(field === "role" ? "Role updated" : "Label updated");
        return true;
      } catch (error) {
        toast.error("Update failed", { description: (error as Error).message });
        return false;
      }
    },
    [apiFetch],
  );

  const isPending = useCallback(
    (agentId: string, op: CommandOp) => pending.has(`${agentId}:${op}`),
    [pending],
  );

  const exportUrl = useCallback(() => {
    return `/api/export${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  }, [token]);

  const value = useMemo<ConsoleContextValue>(
    () => ({
      snapshot,
      status,
      token,
      setToken,
      lastSync,
      apiFetch,
      refresh,
      command,
      updateTurtle,
      isPending,
      exportUrl,
    }),
    [
      snapshot,
      status,
      token,
      setToken,
      lastSync,
      apiFetch,
      refresh,
      command,
      updateTurtle,
      isPending,
      exportUrl,
    ],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole must be used inside ConsoleProvider");
  return value;
}

export function useNow(interval = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}
