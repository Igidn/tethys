// Tethys-compatible types mapped from the cc-util console frontend.
// The cc-util frontend expects cc-util's API shape (Turtle, Station, Mission, Snapshot).
// Tethys exposes Agent / Command / State instead. This file defines the bridge types
// so the copied UI components can render against /api/state and /api/stream.

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
  state: "queued" | "sent" | "done" | "failed" | "expired";
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

export interface EventRecord {
  id: number;
  ts: number;
  agent_id: string | null;
  kind: string;
  data_json: string | null;
}

// ---- Snapshot: cc-util-compatible view of tethys state ----

export interface SnapshotCounts {
  turtles: number;
  online: number;
  miners: number;
  lumberjacks: number;
  haulers: number;
  stationBuilders: number;
  activeMissions: number;
  pausedMissions: number;
  failedMissions: number;
  ores: number;
  blocks: number;
  trips: number;
}

export interface Snapshot {
  serverTime: number;
  tunnelUrl: string | null;
  online: string[];
  config: State["config"];
  counts: SnapshotCounts;
  turtles: PublicTurtle[];
  stations: Station[];
  missions: MissionSummary[];
  events: EventRecord[];
  ores: { name: string; count: number }[];
  oreRecent: never[];
  oreCounts: Record<string, number>;
  chests: Chest[];
  requests: ItemRequest[];
  shaftLocks: ShaftLock[];
}

// Public aliases the cc-util components expect, mapped onto tethys concepts.
export type PublicTurtle = Agent;
export type TurtleRole = Role;
export type MissionState = "offered" | "active" | "paused" | "done" | "failed";

// Placeholder mission type so mining/forestry tabs can compile without real data.
export interface MissionSummary {
  id: string;
  turtleId: string;
  state: MissionState;
  progress: { leg: number; offset: number; layer: number; strip: number } | { cycles: number };
  stats: { blocks: number; ores: number; trips: number };
  percent: number;
  blocksTotal: number;
  plan: { totalBlocks: number; layers: number; strips: number };
  spec: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface Chest {
  id: string;
  stationId: string;
  kind: "storage" | "refuel" | "depot" | "fuel";
  pose: Pose;
  label?: string;
  fillPercent?: number;
}

export interface ItemRequest {
  id: string;
  stationId: string;
  requestedBy: string;
  itemName: string;
  count: number;
  status: "pending" | "assigned" | "delivered" | "cancelled";
  haulerId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ShaftLock {
  stationId: string;
  holderTurtleId: string | null;
  queue: string[];
  acquiredAt: number | null;
  expiresAt: number | null;
}

export interface Station {
  id: string;
  index: number;
  anchor: { x: number; y: number; z: number };
  createdAt: number;
  name: string;
  shaftPose: Pose | null;
  roomPose: Pose | null;
  dockPose: Pose | null;
  minerLanes?: Record<string, number>;
  built: boolean;
  storageChestCount: number;
  storageChestsFilled: number;
  depotNotifiedAt: number | null;
  haulerEvacuatingAt: number | null;
}

export type InventoryItem = { slot: number; name: string; count: number };

// Type guards the cc-util components use
export function isBranchMineSpec(spec: unknown): spec is { kind: "branchMine" } {
  return typeof spec === "object" && spec !== null && (spec as { kind?: string }).kind === "branchMine";
}

export function isTimberSpec(spec: unknown): spec is { kind: "timber" } {
  return typeof spec === "object" && spec !== null && (spec as { kind?: string }).kind === "timber";
}

export function isMiningProgress(p: unknown): p is { leg: number; offset: number; layer: number; strip: number } {
  return typeof p === "object" && p !== null && "leg" in p;
}

export function isTimberProgress(p: unknown): p is { cycles: number } {
  return typeof p === "object" && p !== null && "cycles" in p;
}
