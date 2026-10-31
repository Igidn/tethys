import { useState } from "react";
import { ExternalLink, Pickaxe, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  formatNumber,
  missionMeta,
  poseLabel,
  relativeTime,
  turtleName,
} from "@/lib/format";
import type { MissionSummary } from "@/lib/types";
import { useConsole, useNow } from "@/lib/use-console";
import { PageHeader, SectionHead } from "@/components/common/page-header";
import { StatBand } from "@/components/common/stat-band";
import { EmptyState } from "@/components/common/empty-state";
import { Readout } from "@/components/common/readout";
import { TurtleChip } from "@/components/common/turtle-chip";
import { StatusDot } from "@/components/common/status-dot";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MissionCard } from "@/components/mining/mission-card";
import { MissionControls } from "@/components/mining/mission-controls";
import { SectorSchematic } from "@/components/mining/sector-schematic";
import { isBranchMineSpec, isMiningProgress } from "../lib/types";

export function MiningTab() {
  const { snapshot, refresh, token } = useConsole();
  const now = useNow(10_000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!snapshot) return null;

  // Filter to only branchMine missions for the mining tab
  const miningMissions = snapshot.missions.filter((m) => isBranchMineSpec(m.spec));

  const latestByTurtle = new Map<string, MissionSummary>();
  for (const mission of miningMissions) {
    if (!latestByTurtle.has(mission.turtleId)) latestByTurtle.set(mission.turtleId, mission);
  }

  const miners = snapshot.turtles.filter((turtle) => turtle.role === "miner");
  const board = miners
    .map((turtle) => ({
      turtle,
      mission:
        (turtle.missionId ? snapshot.missions.find((row) => row.id === turtle.missionId) : undefined) ??
        latestByTurtle.get(turtle.id),
    }))
    .sort((a, b) => {
      const rank = (entry: typeof a) => {
        if (!snapshot.online.includes(entry.turtle.id)) return 5;
        if (!entry.mission) return 4;
        return { active: 0, offered: 1, paused: 2, failed: 3, done: 3 }[entry.mission.state] ?? 4;
      };
      return rank(a) - rank(b) || turtleName(a.turtle).localeCompare(turtleName(b.turtle));
    });

  const fallback =
    board.find((entry) => entry.mission?.state === "active")?.mission ??
    board.find((entry) => entry.mission)?.mission;
  const selected =
    snapshot.missions.find((mission) => mission.id === selectedId) ?? fallback;
  const selectedTurtle = selected
    ? snapshot.turtles.find((turtle) => turtle.id === selected.turtleId)
    : undefined;

  const reference = miningMissions[0];
  const depth = Math.abs(snapshot.config.bottomWorldY - snapshot.config.topWorldY);
  const layers = reference?.plan.layers ?? Math.floor(depth / snapshot.config.layerStep) + 1;
  const sector = snapshot.config.sectorHalf * 2;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="operations / 02 · mining"
        title="Sectors, missions, and the walk home."
        description="The server assigns a deterministic branch-mine. The turtle owns movement and fuel. Start, recall, or abort without leaving this board."
        meta={
          <span>
            {snapshot.counts.activeMissions} running · {snapshot.counts.pausedMissions} paused ·{" "}
            {snapshot.counts.failedMissions} failed in 24h
          </span>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw data-icon="inline-start" />
            Sync
          </Button>
        }
      />

      <StatBand
        items={[
          {
            label: "sector",
            value: `${sector} × ${sector}`,
            unit: "blocks",
            hint: `${layers} layers · step ${snapshot.config.layerStep}`,
          },
          {
            label: "plan size",
            value: reference ? formatNumber(reference.blocksTotal) : "—",
            unit: "blocks",
            hint: reference ? `${reference.plan.strips} strips per layer` : "no mission yet",
          },
          {
            label: "ore cells",
            value: formatNumber(snapshot.counts.ores),
            hint: "sparse vein map",
            tone: "signal",
          },
          {
            label: "trip budget",
            value: snapshot.config.maxTripBlocks,
            unit: "blocks",
            hint: `reserve ${snapshot.config.reserve} · vein cap ${snapshot.config.maxVeinBlocks}`,
          },
        ]}
      />

      {miners.length === 0 ? (
        <EmptyState
          icon={Pickaxe}
          title="No miners assigned"
          description="The mining board only dispatches branch mines to units with the miner role. Assign a role in Fleet, or preview the forestry workflow."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  window.location.hash = "fleet";
                }}
              >
                Open fleet
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.hash = "forestry";
                }}
              >
                Forestry preview
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
          <section className="flex flex-col gap-3">
            <SectionHead
              kicker="board"
              title="Miner missions"
              description="Latest plan per miner. Select one to inspect the sector."
            />
            <div className="flex flex-col gap-2.5">
              {board.map((entry) => (
                <MissionCard
                  key={entry.turtle.id}
                  turtle={entry.turtle}
                  mission={entry.mission}
                  selected={Boolean(entry.mission && entry.mission.id === selected?.id)}
                  onSelect={() => entry.mission && setSelectedId(entry.mission.id)}
                />
              ))}
            </div>
          </section>

          <section className="min-w-0">
            {selected && selectedTurtle && isBranchMineSpec(selected.spec) && isMiningProgress(selected.progress) ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-border/80 bg-card/40">
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <TurtleChip turtle={selectedTurtle} size="lg" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <h2 className="display text-lg font-semibold">
                            {turtleName(selectedTurtle)}
                          </h2>
                          <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                            mission {selected.id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1.5">
                            <StatusDot
                              tone={missionMeta(selected.state).tone}
                              pulse={selected.state === "active"}
                            />
                            <span className="mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                              {missionMeta(selected.state).label}
                            </span>
                          </span>
                          <span className="mono text-[10px] text-muted-foreground">
                            updated {relativeTime(selected.updatedAt, now)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="mr-2 text-right">
                        <div className="mono text-lg tabular-nums">{Math.round(selected.percent)}%</div>
                        <div className="mono text-[9px] text-muted-foreground">
                          {formatNumber(selected.stats.blocks)} / {formatNumber(selected.blocksTotal)}
                        </div>
                      </div>
                      <MissionControls
                        turtle={selectedTurtle}
                        mission={selected}
                        online={snapshot.online.includes(selectedTurtle.id)}
                      />
                    </div>
                  </header>

                  <div className="h-1 bg-muted">
                    <div
                      className={cn(
                        "h-full transition-[width] duration-700",
                        selected.state === "failed"
                          ? "bg-destructive"
                          : selected.state === "paused"
                          ? "bg-warning"
                          : "bg-signal",
                      )}
                      style={{ width: `${Math.max(selected.percent, 1)}%` }}
                    />
                  </div>

                  <div className="p-3 sm:p-4">
                    <SectorSchematic mission={selected} />
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-border/70 p-4 sm:grid-cols-4">
                    <Readout
                      label="layer / strip"
                      value={`${selected.progress.layer + 1}/${selected.plan.layers}`}
                      hint={`strip ${selected.progress.strip + 1}/${selected.plan.strips}`}
                    />
                    <Readout
                      label="leg / offset"
                      value={`${selected.progress.leg} · ${selected.progress.offset}`}
                      hint="durable plan cursor"
                    />
                    <Readout label="ores" value={selected.stats.ores} hint={`${selected.stats.trips} trips`} tone="signal" />
                    <Readout
                      label="fuel"
                      value={selectedTurtle.fuel === "unlimited" ? "∞" : (selectedTurtle.fuel ?? "—")}
                      hint={`reserve ${snapshot.config.reserve}`}
                    />
                    <Readout label="pose" value={poseLabel(selectedTurtle.pose)} />
                    <Readout
                      label="sector"
                      value={`${selected.spec.sector.x0}…${selected.spec.sector.x1}`}
                      hint={`z ${selected.spec.sector.z0}…${selected.spec.sector.z1}`}
                    />
                    <Readout
                      label="depth"
                      value={`${selected.spec.startY} → ${selected.spec.endY}`}
                      hint={`layer step ${selected.spec.layerStep}`}
                    />
                    <Readout
                      label="trip cap"
                      value={selected.spec.maxTripBlocks}
                      hint={`veins ≤ ${selected.spec.maxVeinBlocks}`}
                    />
                  </div>

                  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-3">
                    <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      {selected.plan.totalBlocks.toLocaleString()} plan blocks · {selected.plan.layers} layers
                    </span>
                    <a
                      href={`/api/map?missionId=${encodeURIComponent(selected.id)}${
                        token ? `&token=${encodeURIComponent(token)}` : ""
                      }`}
                      target="_blank"
                      rel="noreferrer"
                      className="mono flex items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-signal"
                    >
                      raw map JSON
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </footer>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Pickaxe}
                title="Select a mission"
                description="Pick a turtle on the board to inspect its plan, progress, and controls."
              />
            )}
          </section>
        </div>
      )}

      {snapshot.missions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHead
            kicker="record"
            title="Mission history"
            description="Current and closed missions, newest first. Inspect an old plan without changing the turtle."
            action={<span className="mono text-[10px] text-muted-foreground">{snapshot.missions.length} rows</span>}
          />
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card/30">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    mission
                  </TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    turtle
                  </TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    state
                  </TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    progress
                  </TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    blocks
                  </TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    ores
                  </TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    duration
                  </TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    updated
                  </TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(snapshot.missions ?? []).slice(0, 16).map((mission) => {
                  const turtle = snapshot.turtles.find((entry) => entry.id === mission.turtleId);
                  const meta = missionMeta(mission.state);
                  return (
                    <TableRow key={mission.id}>
                      <TableCell className="mono text-[10px] text-muted-foreground">
                        {mission.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {turtle ? <TurtleChip turtle={turtle} size="sm" showRole={false} /> : null}
                          <span className="truncate text-[11px]">
                            {turtle ? turtleName(turtle) : mission.turtleId.slice(0, 6)}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <StatusDot tone={meta.tone} />
                          <span className="mono text-[10px] text-muted-foreground">{meta.label}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
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
                          <span className="mono text-[10px] tabular-nums text-muted-foreground">
                            {Math.round(mission.percent)}%
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="mono text-[10px] tabular-nums">
                        {formatNumber(mission.stats.blocks)}
                      </TableCell>
                      <TableCell className="mono text-[10px] tabular-nums">{mission.stats.ores}</TableCell>
                      <TableCell className="mono text-[10px] text-muted-foreground">
                        {formatDuration(mission.updatedAt - mission.createdAt)}
                      </TableCell>
                      <TableCell className="mono text-[10px] text-muted-foreground">
                        {relativeTime(mission.updatedAt, now)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedId(mission.id)}
                        >
                          inspect
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}