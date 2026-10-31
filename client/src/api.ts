export type Role = "unassigned" | "mining" | "music";

export interface Pose {
  x: number;
  y: number;
  z: number;
  f: number;
}

export type AgentStatus = "pending" | "active" | "removing" | "removed";

export interface Agent {
  id: string;
  label: string | null;
  computerId: number | null;
  role: Role;
  status: AgentStatus;
  state: string | null;
  online: boolean;
  channel: string;
  runtime: string | null;
  fuel: number | string | null;
  pose: Pose | null;
  inventory: unknown[];
  pairingCode: string | null;
  createdAt: number;
  approvedAt: number | null;
  lastSeen: number | null;
  config: Record<string, unknown>;
}

export interface Command {
  id: string;
  op: string;
  state: "pending" | "sent" | "done" | "failed";
  attempts: number;
  payload: Record<string, unknown>;
  result: unknown;
  createdAt: number;
  ackedAt: number | null;
}

export interface State {
  serverTime: number;
  agents: Agent[];
  pending: Agent[];
  counts: {
    agents: number;
    online: number;
    pending: number;
    removing: number;
    mining: number;
    music: number;
  };
  commands: Command[];
  config: {
    heartbeatMs: number;
    staleMs: number;
    adminRequired: boolean;
    githubRepo: string;
    liveTag: string;
    roles: Role[];
  };
  tunnel: {
    url: string | null;
    verified: boolean;
    host: string | null;
    target: string | null;
  } | null;
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body && typeof body.detail === "string") message = body.detail;
    } catch {
      // keep the status line
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const getState = (token: string) => request<State>(token, "/api/state");

export const approveAgent = (
  token: string,
  id: string,
  role: Role,
  config: Record<string, unknown> = {},
) =>
  request<{ ok: boolean; agent: Agent }>(token, `/api/agents/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ role, config }),
  });

export const changeRole = (token: string, id: string, role: Role) =>
  request<{ ok: boolean; agent: Agent }>(token, `/api/agents/${id}/role`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });

export const rebootAgent = (token: string, id: string) =>
  request<{ ok: boolean }>(token, `/api/agents/${id}/reboot`, { method: "POST" });

export const uninstallAgent = (token: string, id: string) =>
  request<{ ok: boolean }>(token, `/api/agents/${id}/uninstall`, { method: "POST" });

export const removeAgent = (token: string, id: string, force = false) =>
  request<{ ok: boolean; removed: boolean }>(
    token,
    `/api/agents/${id}${force ? "?force=true" : ""}`,
    { method: "DELETE" },
  );

/**
 * Read state snapshots over SSE. `fetch` is used instead of EventSource so the
 * bearer token stays in a header rather than in a URL.
 */
export function openStream(
  token: string,
  onState: (state: State) => void,
  onError: (error: Error) => void,
): () => void {
  const controller = new AbortController();

  const run = async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch("/api/stream", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`${response.status} ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("");
            if (data) onState(JSON.parse(data) as State);
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        onError(cause instanceof Error ? cause : new Error(String(cause)));
      }

      if (!controller.signal.aborted) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
    }
  };

  void run();
  return () => controller.abort();
}
