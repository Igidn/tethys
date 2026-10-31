import { useState } from "react";
import {
  Bot,
  ChevronRight,
  FilterX,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import {
  fuelRatio,
  fuelTone,
  inventoryStats,
  relativeTime,
  roleLabel,
  roleTone,
  stateMeta,
  turtleName,
} from "@/lib/format";
import type { TurtleRole } from "@/lib/types";
import { useConsole, useNow } from "@/lib/use-console";
import { buildIssues } from "@/lib/attention";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatBand } from "@/components/common/stat-band";
import { EmptyState } from "@/components/common/empty-state";
import { TurtleChip } from "@/components/common/turtle-chip";
import { FuelBar } from "@/components/common/fuel-bar";
import { StatusDot } from "@/components/common/status-dot";
import { TurtleSheet } from "@/components/fleet/turtle-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StatusFilter = "all" | "online" | "offline" | "attention" | "idle";
type RoleFilter = "all" | TurtleRole;

export function FleetTab() {
  const { snapshot, refresh } = useConsole();
  const now = useNow(10_000);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!snapshot) return null;

  const issues = buildIssues(snapshot, now);
  const alertIds = new Set(
    issues.filter((issue) => issue.severity !== "info").map((issue) => issue.turtle.id),
  );
  const online = new Set(snapshot.online);

  const roleCounts = snapshot.turtles.reduce(
    (counts, turtle) => {
      counts[turtle.role] += 1;
      return counts;
    },
    { miner: 0, lumberjack: 0, hauler: 0, unassigned: 0 } as Record<TurtleRole, number>,
  );
  const roleCount = (count: number, label: string) => `${count} ${label}${count === 1 ? "" : "s"}`;
  const roleBreakdown = [
    roleCount(roleCounts.lumberjack, "lumberjack"),
    roleCount(roleCounts.hauler, "hauler"),
    roleCount(roleCounts.unassigned, "unassigned"),
  ].join(" · ");

  const cargo = snapshot.turtles.reduce(
    (total, turtle) => {
      const hold = inventoryStats(turtle.inventory);
      total.slots += hold.slots;
      total.capacity += hold.capacity;
      return total;
    },
    { slots: 0, capacity: 0 },
  );
  const fuelRisk = snapshot.turtles.filter(
    (turtle) => typeof turtle.fuel === "number" && turtle.fuel <= snapshot.config.reserve,
  ).length;

  const search = query.trim().toLowerCase();
  const rows = snapshot.turtles
    .filter((turtle) => {
      if (role !== "all" && turtle.role !== role) return false;
      if (status === "online" && !online.has(turtle.id)) return false;
      if (status === "offline" && online.has(turtle.id)) return false;
      if (status === "attention" && !alertIds.has(turtle.id)) return false;
      if (status === "idle") {
        const latest =
          snapshot.missions.find((mission) => mission.id === turtle.missionId) ??
          snapshot.missions.find((mission) => mission.turtleId === turtle.id);
        if (latest && (latest.state === "active" || latest.state === "offered")) return false;
      }
      if (!search) return true;
      const station = snapshot.stations.find((entry) => entry.id === turtle.stationId);
      const haystack = [
        turtleName(turtle),
        turtle.label,
        turtle.id,
        turtle.computerId,
        turtle.role,
        station ? `s${station.index}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => {
      const aAlert = alertIds.has(a.id) ? 0 : 1;
      const bAlert = alertIds.has(b.id) ? 0 : 1;
      const aOnline = online.has(a.id) ? 0 : 1;
      const bOnline = online.has(b.id) ? 0 : 1;
      return (
        aAlert - bAlert ||
        aOnline - bOnline ||
        turtleName(a).localeCompare(turtleName(b))
      );
    });

  const selected = snapshot.turtles.find((turtle) => turtle.id === selectedId);
  const clear = () => {
    setQuery("");
    setRole("all");
    setStatus("all");
  };

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="operations / 04 · fleet"
        title="The robots, their roles, and what they carry."
        description="Every registered turtle, its station, current plan, fuel, and hold. Rename a unit or reassign its role without touching the robot."
        meta={
          <span>
            {rows.length} of {snapshot.turtles.length} shown · {fuelRisk} fuel risk ·{" "}
            {cargo.slots}/{cargo.capacity} cargo slots
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw data-icon="inline-start" />
              Sync
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.hash = "settings";
              }}
            >
              <Settings2 data-icon="inline-start" />
              Install a turtle
            </Button>
          </>
        }
      />

      <StatBand
        items={[
          {
            label: "fleet",
            value: snapshot.turtles.length,
            unit: "robots",
            hint: `${online.size} reporting`,
            tone: online.size === snapshot.turtles.length ? "live" : "warning",
          },
          {
            label: "roles",
            value: roleCounts.miner,
            unit: roleCounts.miner === 1 ? "miner" : "miners",
            hint: roleBreakdown,
          },
          {
            label: "cargo",
            value: `${cargo.slots}/${cargo.capacity}`,
            unit: "slots",
            hint: `${cargo.capacity ? Math.round((cargo.slots / cargo.capacity) * 100) : 0}% of fleet hold`,
            tone: cargo.slots > cargo.capacity * 0.7 ? "warning" : "muted",
          },
          {
            label: "fuel risk",
            value: fuelRisk,
            unit: fuelRisk === 1 ? "turtle" : "turtles",
            hint: `reserve ${snapshot.config.reserve}`,
            tone: fuelRisk ? "warning" : "live",
          },
        ]}
      />

      {snapshot.turtles.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No turtles on the wire"
          description="Install the runtime on a CC: Tweaked turtle. It will register, claim the next station, and appear in this table."
          action={
            <Button
              size="sm"
              onClick={() => {
                window.location.hash = "settings";
              }}
            >
              Open install command
            </Button>
          }
        />
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/35 p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="search call sign, id, station"
                className="pl-8"
                aria-label="Search fleet"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={role} onValueChange={(value) => setRole(value as RoleFilter)}>
                <SelectTrigger size="sm" className="w-[126px]">
                  <SelectValue placeholder="role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all roles</SelectItem>
                  <SelectItem value="miner">miner</SelectItem>
                  <SelectItem value="lumberjack">lumberjack</SelectItem>
                  <SelectItem value="hauler">hauler</SelectItem>
                  <SelectItem value="station_builder">station builder</SelectItem>
                  <SelectItem value="unassigned">unassigned</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as StatusFilter)}
              >
                <SelectTrigger size="sm" className="w-[136px]">
                  <SelectValue placeholder="status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all states</SelectItem>
                  <SelectItem value="online">online</SelectItem>
                  <SelectItem value="offline">offline</SelectItem>
                  <SelectItem value="attention">needs attention</SelectItem>
                  <SelectItem value="idle">idle</SelectItem>
                </SelectContent>
              </Select>
              {query || role !== "all" || status !== "all" ? (
                <Button variant="ghost" size="sm" onClick={clear}>
                  <FilterX data-icon="inline-start" />
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No turtles match"
              description="Clear the filters to see the full fleet."
              action={
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card/30">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      turtle
                    </TableHead>
                    <TableHead className="mono hidden text-[9px] uppercase tracking-[0.12em] text-muted-foreground md:table-cell">
                      role
                    </TableHead>
                    <TableHead className="mono hidden text-[9px] uppercase tracking-[0.12em] text-muted-foreground lg:table-cell">
                      station
                    </TableHead>
                    <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      state
                    </TableHead>
                    <TableHead className="mono hidden text-[9px] uppercase tracking-[0.12em] text-muted-foreground lg:table-cell">
                      mission
                    </TableHead>
                    <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      fuel
                    </TableHead>
                    <TableHead className="mono hidden text-[9px] uppercase tracking-[0.12em] text-muted-foreground xl:table-cell">
                      hold
                    </TableHead>
                    <TableHead className="mono hidden text-[9px] uppercase tracking-[0.12em] text-muted-foreground xl:table-cell">
                      last seen
                    </TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((turtle) => {
                    const isOnline = online.has(turtle.id);
                    const meta = stateMeta(turtle.state, isOnline);
                    const station = snapshot.stations.find(
                      (entry) => entry.id === turtle.stationId,
                    );
                    const mission = snapshot.missions.find(
                      (entry) => entry.id === turtle.missionId,
                    );
                    const hold = inventoryStats(turtle.inventory);
                    const alert = alertIds.has(turtle.id);
                    return (
                      <TableRow
                        key={turtle.id}
                        className={cn(
                          "group",
                          alert && "bg-warning/[0.025] hover:bg-warning/[0.055]",
                        )}
                      >
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setSelectedId(turtle.id)}
                            className="flex min-w-0 items-center gap-2.5 text-left"
                          >
                            <TurtleChip turtle={turtle} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-medium">
                                {turtleName(turtle)}
                              </span>
                              <span className="mono block truncate text-[9px] text-muted-foreground">
                                {turtle.id.slice(0, 8)}
                                {turtle.computerId ? ` · c${turtle.computerId}` : ""}
                              </span>
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="flex items-center gap-1.5">
                            <StatusDot tone={roleTone(turtle.role)} />
                            <span className="mono text-[10px] text-muted-foreground">
                              {roleLabel(turtle.role)}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="mono hidden text-[10px] text-muted-foreground lg:table-cell">
                          {station ? `S${String(station.index).padStart(2, "0")}` : "—"}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            <StatusDot tone={meta.tone} pulse={isOnline && meta.tone === "live"} />
                            <span className="mono text-[10px] text-muted-foreground">
                              {meta.label}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {mission ? (
                            <span className="flex items-center gap-2">
                              <span className="h-1 w-14 overflow-hidden rounded-full bg-muted">
                                <span
                                  className={cn(
                                    "block h-full rounded-full",
                                    mission.state === "failed"
                                      ? "bg-destructive"
                                      : mission.state === "paused"
                                        ? "bg-warning"
                                        : "bg-signal",
                                  )}
                                  style={{ width: `${Math.max(mission.percent, 1)}%` }}
                                />
                              </span>
                              <span className="mono text-[9px] tabular-nums text-muted-foreground">
                                {Math.round(mission.percent)}%
                              </span>
                            </span>
                          ) : (
                            <span className="mono text-[9px] text-muted-foreground/50">
                              {isOnline ? "idle" : "no mission"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FuelBar
                              fuel={turtle.fuel}
                              reserve={snapshot.config.reserve}
                              segments={8}
                              showValue={false}
                              className="w-16"
                            />
                            <span
                              className={cn(
                                "mono text-[10px] tabular-nums",
                                fuelTone(turtle.fuel, snapshot.config.reserve) === "danger"
                                  ? "text-destructive"
                                  : fuelTone(turtle.fuel, snapshot.config.reserve) === "warning"
                                    ? "text-warning"
                                    : "text-muted-foreground",
                              )}
                              title={`fuel ${turtle.fuel ?? "unknown"}`}
                            >
                              {turtle.fuel === "unlimited" ? "∞" : (turtle.fuel ?? "—")}
                            </span>
                          </div>
                          <div
                            className="mt-1 hidden h-0.5 w-16 overflow-hidden rounded-full bg-muted sm:block"
                            aria-hidden="true"
                          >
                            <span
                              className="block h-full bg-signal/60"
                              style={{
                                width: `${Math.round(
                                  fuelRatio(turtle.fuel, snapshot.config.reserve) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <span className="flex items-center gap-2">
                            <span className="h-1 w-14 overflow-hidden rounded-full bg-muted">
                              <span
                                className={cn(
                                  "block h-full",
                                  hold.slots >= 15 ? "bg-warning" : "bg-live/70",
                                )}
                                style={{ width: `${hold.percent}%` }}
                              />
                            </span>
                            <span className="mono text-[9px] tabular-nums text-muted-foreground">
                              {hold.slots}/16
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="mono hidden text-[10px] text-muted-foreground xl:table-cell">
                          {relativeTime(turtle.lastSeen, now)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Inspect ${turtleName(turtle)}`}
                            onClick={() => setSelectedId(turtle.id)}
                          >
                            <ChevronRight />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      <TurtleSheet
        turtle={selected}
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
