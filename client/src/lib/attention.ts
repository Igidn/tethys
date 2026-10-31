import { inventoryStats, relativeTime, roleLabel, turtleName } from "./format";
import type { MissionSummary, PublicTurtle, Snapshot } from "./types";

export type IssueSeverity = "danger" | "warning" | "info";

export type IssueAction = {
  op: "start" | "return" | "abort" | "ping";
  label: string;
};

export type Issue = {
  id: string;
  severity: IssueSeverity;
  turtle: PublicTurtle;
  name: string;
  title: string;
  detail: string;
  action?: IssueAction;
};

const severityRank: Record<IssueSeverity, number> = { danger: 0, warning: 1, info: 2 };

export function buildIssues(snapshot: Snapshot, now = Date.now()): Issue[] {
  const online = new Set(snapshot.online);
  const reserve = snapshot.config.reserve;
  const latest = new Map<string, MissionSummary>();
  for (const mission of snapshot.missions) {
    if (!latest.has(mission.turtleId)) latest.set(mission.turtleId, mission);
  }

  const issues: Issue[] = [];

  for (const turtle of snapshot.turtles) {
    const name = turtleName(turtle);
    const isOnline = online.has(turtle.id);
    const mission =
      (turtle.missionId ? snapshot.missions.find((row) => row.id === turtle.missionId) : undefined) ??
      latest.get(turtle.id);
    const state = turtle.state.toLowerCase();
    const push = (
      key: string,
      severity: IssueSeverity,
      title: string,
      detail: string,
      action?: IssueAction,
    ) => {
      issues.push({
        id: `${turtle.id}:${key}`,
        severity,
        turtle,
        name,
        title,
        detail,
        action,
      });
    };

    if (!isOnline) {
      const veryStale = now - turtle.lastSeen > snapshot.config.staleMs * 3;
      push(
        "offline",
        veryStale ? "danger" : "warning",
        "No heartbeat",
        `Last seen ${relativeTime(turtle.lastSeen, now)}. Chunk loading may have paused it.`,
      );
      continue;
    }

    if (state.includes("recovery_failed")) {
      push("recovery", "danger", "Recovery failed", "The turtle could not retrace its tape. Rescue it before restarting.");
      continue;
    }

    if (state === "halted") {
      push("halted", "danger", "Halted after abort", "It is parked at the dock and waiting for an operator.");
    }

    if (typeof turtle.fuel === "number") {
      if (turtle.fuel <= reserve * 0.5) {
        push(
          "fuel-critical",
          "danger",
          "Fuel below half reserve",
          `${turtle.fuel} fuel, reserve is ${reserve}. Recall before it strands in the tunnel.`,
          { op: "return", label: "Recall" },
        );
      } else if (turtle.fuel <= reserve) {
        push(
          "fuel-low",
          "warning",
          "Fuel reserve reached",
          `${turtle.fuel} fuel left, reserve is ${reserve}.`,
          { op: "return", label: "Recall" },
        );
      }
    }

    const hold = inventoryStats(turtle.inventory);
    if (hold.slots >= 15) {
      push(
        "cargo",
        "warning",
        "Cargo nearly full",
        `${hold.slots} of ${hold.capacity} slots used. It will end the trip on the next check.`,
        { op: "return", label: "Recall" },
      );
    }

    if (mission?.state === "paused") {
      push(
        "paused",
        "warning",
        "Mission paused",
        turtle.role === "miner"
          ? `Paused at ${Math.round(mission.percent)} percent. Resume when the dock is clear.`
          : `Paused at ${Math.round(mission.percent)} percent, but the ${roleLabel(turtle.role)} role cannot resume it. Reassign to miner or abort.`,
        turtle.role === "miner" ? { op: "start", label: "Resume" } : undefined,
      );
    } else if (mission?.state === "failed" && now - mission.updatedAt < 86_400_000) {
      push(
        "failed",
        "warning",
        "Last mission failed",
        turtle.role === "miner"
          ? `Failed ${relativeTime(mission.updatedAt, now)}. Start a fresh mission when ready.`
          : `Failed ${relativeTime(mission.updatedAt, now)}. Reassign to miner before starting another.`,
        turtle.role === "miner" ? { op: "start", label: "Start" } : undefined,
      );
    } else if (mission?.state === "active" && now - mission.updatedAt > 15 * 60_000) {
      push(
        "stalled",
        "warning",
        "No progress reported",
        `Mission has not updated in ${relativeTime(mission.updatedAt, now).replace(" ago", "")}.`,
        { op: "ping", label: "Ping" },
      );
    } else if (!mission) {
      if (turtle.role !== "miner") {
        push(
          "role-note",
          "info",
          turtle.role === "lumberjack"
            ? "Forestry runtime not built"
            : turtle.role === "hauler"
              ? "Hauler dispatch not wired"
              : "No role assigned",
          turtle.role === "lumberjack"
            ? "The role is stored, but harvest jobs still live in the Forestry preview."
            : turtle.role === "hauler"
              ? "The role is stored, but no hauling job schema or runtime exists yet."
              : "Assign a role in Fleet. Work routing and readiness depend on it.",
        );
      } else {
        const hasHistory = snapshot.missions.some((row) => row.turtleId === turtle.id);
        push(
          "idle",
          "info",
          hasHistory ? "Idle, no mission" : "Ready for first mission",
          hasHistory
            ? "The last mission is closed. Queue the next sector."
            : "It will start automatically on its next hello.",
          hasHistory ? { op: "start", label: "Start" } : undefined,
        );
      }
    }
  }

  return issues.sort((a, b) => {
    const rank = severityRank[a.severity] - severityRank[b.severity];
    if (rank !== 0) return rank;
    return a.name.localeCompare(b.name);
  });
}

export function issueCount(issues: Issue[]): number {
  return issues.filter((issue) => issue.severity !== "info").length;
}
