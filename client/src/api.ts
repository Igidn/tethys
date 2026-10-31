export type Role = "unassigned" | "mining" | "music";

export interface Pose {
  x: number;
  y: number;
  z: number;
  f: number;
}

export interface Agent {
  id: string;
  label: string | null;
  computerId: number | null;
  role: Role;
  status: "pending" | "active" | "removed";
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

export interface State {
  serverTime: number;
  agents: Agent[];
  pending: Agent[];
  counts: {
    agents: number;
    online: number;
    pending: number;
    mining: number;
    music: number;
  };
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

export const removeAgent = (token: string, id: string) =>
  request<{ ok: boolean }>(token, `/api/agents/${id}`, { method: "DELETE" });
