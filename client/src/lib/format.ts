import type {
  Agent,
  Command,
  MissionState,
  MissionSummary,
  PublicTurtle,
  TurtleRole,
} from "./types";

export type Tone = "live" | "warning" | "danger" | "info" | "signal" | "muted";

export const toneText: Record<Tone, string> = {
  live: "text-live",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  signal: "text-signal",
  muted: "text-muted-foreground",
};

export const toneBg: Record<Tone, string> = {
  live: "bg-live",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  signal: "bg-signal",
  muted: "bg-muted-foreground",
};

export const toneSurface: Record<Tone, string> = {
  live: "bg-live/10 text-live border-live/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
  info: "bg-info/10 text-info border-info/25",
  signal: "bg-signal/10 text-signal border-signal/25",
  muted: "bg-muted text-muted-foreground border-border",
};

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function compactNumber(value: number): string {
  if (Math.abs(value) < 1000) return String(Math.round(value));
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function relativeTime(at: number, now = Date.now()): string {
  if (!at) return "never";
  const delta = Math.max(0, now - at);
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export function formatClock(at = Date.now()): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(at);
}

export function formatDateTime(at: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

export function dayLabel(at: number, now = Date.now()): string {
  const date = new Date(at);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (at >= startOfToday) return "Today";
  if (at >= startOfToday - 86_400_000) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
}

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-3)}` : id;
}

export function turtleName(turtle: Pick<PublicTurtle, "label" | "computerId" | "id">): string {
  return turtle.label?.trim() || (turtle.computerId ? `turtle-${turtle.computerId}` : shortId(turtle.id));
}

export function initials(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9 -]/g, "").trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function poseLabel(pose?: { x: number; y: number; z: number; f: number }): string {
  if (!pose) return "unknown";
  const facing = ["north", "east", "south", "west"][pose.f] ?? `f${pose.f}`;
  return `${pose.x}, ${pose.y}, ${pose.z} · ${facing}`;
}

export function roleLabel(role: TurtleRole): string {
  const labels: Record<TurtleRole, string> = {
    unassigned: "unassigned",
    mining: "mining",
    music: "music",
  };
  return labels[role] ?? role;
}

export function roleTone(role: TurtleRole): Tone {
  const tones: Record<TurtleRole, Tone> = {
    unassigned: "muted",
    mining: "signal",
    music: "live",
  };
  return tones[role] ?? "muted";
}

export function stateMeta(state: string, online: boolean): { label: string; tone: Tone } {
  const normalized = state.toLowerCase();
  if (!online) {
    if (normalized === "stale") return { label: "stale", tone: "warning" };
    return { label: normalized || "offline", tone: "muted" };
  }
  if (normalized.includes("fault") || normalized.includes("recovery_failed")) {
    return { label: normalized, tone: "danger" };
  }
  if (normalized === "halted") return { label: normalized, tone: "danger" };
  if (normalized === "paused") return { label: normalized, tone: "warning" };
  if (normalized === "mining" || normalized === "working") return { label: normalized, tone: "signal" };
  if (normalized === "returning" || normalized === "unloading") {
    return { label: normalized, tone: "live" };
  }
  if (normalized === "connected" || normalized === "idle") {
    return { label: normalized, tone: "live" };
  }
  return { label: normalized || "unknown", tone: "info" };
}

export function missionMeta(state: MissionState): { label: string; tone: Tone } {
  const map: Record<MissionState, { label: string; tone: Tone }> = {
    offered: { label: "offered", tone: "info" },
    active: { label: "active", tone: "signal" },
    paused: { label: "paused", tone: "warning" },
    done: { label: "done", tone: "live" },
    failed: { label: "failed", tone: "danger" },
  };
  return map[state] ?? { label: state, tone: "muted" };
}

export function eventMeta(kind: string, data?: unknown): { label: string; tone: Tone } {
  const record = (data ?? {}) as Record<string, unknown>;
  const map: Record<string, { label: string; tone: Tone }> = {
    connected: { label: "connected", tone: "live" },
    disconnected: { label: "disconnected", tone: "warning" },
    registered: { label: "registered", tone: "info" },
    mission_created: { label: "mission created", tone: "signal" },
    role_changed: { label: "role changed", tone: "info" },
    renamed: { label: "renamed", tone: "info" },
    ore: { label: "ore found", tone: "signal" },
    fault: { label: "fault", tone: "danger" },
    recovery_failed: { label: "recovery failed", tone: "danger" },
  };
  return map[kind] ?? { label: kind.replace(/_/g, " "), tone: "muted" };
}

export function inventoryStats(inventory?: unknown[] | null) {
  const items = Array.isArray(inventory) ? inventory : [];
  const slots = items.filter(() => true).length;
  const total = items.length;
  return { slots, total, capacity: 16, percent: Math.round((slots / 16) * 100) };
}

export function fuelRatio(fuel: number | "unlimited" | undefined, reserve: number): number {
  if (fuel === "unlimited") return 1;
  if (typeof fuel !== "number" || !Number.isFinite(fuel)) return 0;
  return clamp(fuel / Math.max(1, reserve * 4));
}

export function fuelTone(fuel: number | "unlimited" | undefined, reserve: number): Tone {
  if (fuel === "unlimited") return "live";
  if (typeof fuel !== "number") return "muted";
  if (fuel <= reserve * 0.5) return "danger";
  if (fuel <= reserve) return "warning";
  return "live";
}

export function stationLabel(index: number, id?: string): string {
  return `S${String(index).padStart(2, "0")}${id && id !== `s${index}` ? ` · ${id}` : ""}`;
}

export function hostFromUrl(url: string): string {
  if (!url) return "no tunnel";
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

export function progressPercent(mission: MissionSummary): number {
  return Math.max(0, Math.min(100, mission.percent));
}

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function prettyItem(name: string): string {
  const id = name.includes(":") ? name.slice(name.indexOf(":") + 1) : name;
  return id.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function itemTone(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("diamond")) return "var(--ore-diamond)";
  if (lower.includes("emerald")) return "var(--ore-emerald)";
  if (lower.includes("gold")) return "var(--ore-gold)";
  if (lower.includes("redstone")) return "var(--ore-redstone)";
  if (lower.includes("lapis")) return "var(--ore-lapis)";
  if (lower.includes("copper")) return "var(--ore-copper)";
  if (lower.includes("iron") || lower.includes("tin") || lower.includes("nickel")) {
    return "oklch(0.76 0.03 95)";
  }
  if (lower.includes("coal") || lower.includes("charcoal")) return "oklch(0.45 0.015 100)";
  if (lower.includes("debris") || lower.includes("netherite")) return "oklch(0.55 0.06 25)";
  if (lower.includes("log") || lower.includes("wood") || lower.includes("plank")) {
    return "oklch(0.68 0.09 62)";
  }
  if (lower.includes("lava")) return "oklch(0.72 0.18 45)";
  return "var(--muted-foreground)";
}
