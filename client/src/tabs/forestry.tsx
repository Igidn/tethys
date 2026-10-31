import { useState } from "react";
import {
  Archive,
  Pause,
  Play,
  Plus,
  Sprout,
  Trees,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  formatNumber,
  missionMeta,
  relativeTime,
  turtleName,
} from "@/lib/format";
import type { MissionSummary, MissionStats } from "@/lib/types";
import { useConsole, useNow } from "@/lib/use-console";
import { PageHeader, SectionHead } from "@/components/common/page-header";
import { StatBand } from "@/components/common/stat-band";
import { Readout } from "@/components/common/readout";
import { TurtleChip } from "@/components/common/turtle-chip";
import { StatusDot } from "@/components/common/status-dot";
import { EmptyState } from "@/components/common/empty-state";
import { GroveSchematic } from "@/components/forestry/grove-schematic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { isTimberSpec } from "../lib/types";

const speciesColor: Record<string, string> = {
  oak: "oklch(0.74 0.11 120)",
  birch: "oklch(0.84 0.07 95)",
  spruce: "oklch(0.62 0.09 155)",
  acacia: "oklch(0.72 0.12 55)",
  dark_oak: "oklch(0.5 0.07 70)",
};

function getTimberSpec(job: MissionSummary) {
  return isTimberSpec(job.spec) ? job.spec : null;
}

function getTimberStats(stats: MissionStats) {
  return "logs" in stats ? stats : { logs: 0, planted: 0, collected: 0, deposited: 0 };
}

function getRadius(job: MissionSummary): number {
  const spec = getTimberSpec(job);
  return spec?.radius ?? 32;
}

function getSpecies(job: MissionSummary): string[] {
  const spec = getTimberSpec(job);
  return spec?.species ?? ["oak"];
}

function getReplant(job: MissionSummary): boolean {
  const spec = getTimberSpec(job);
  return spec?.replant ?? true;
}

function getDeposit(job: MissionSummary): string {
  const spec = getTimberSpec(job);
  return spec?.deposit ?? "unassigned";
}

function getLogs(stats: MissionStats): number {
  const t = getTimberStats(stats);
  return t.logs;
}

function getPlanted(stats: MissionStats): number {
  const t = getTimberStats(stats);
  return t.planted;
}

function getProgressValue(progress: MissionSummary["progress"]): number {
  return "cycles" in progress ? progress.cycles : 0;
}

function jobYield(job: MissionSummary): number {
  const spec = getTimberSpec(job);
  if (!spec) return 0;
  const trees = Math.max(8, Math.round(getRadius(job) * 3.2));
  const species = getSpecies(job);
  const progress = getProgressValue(job.progress);
  const speciesYield: Record<string, number> = {
    oak: 6,
    birch: 4,
    spruce: 7,
    acacia: 5,
    dark_oak: 8,
  };
  const average =
    species.reduce((sum: number, id: string) => sum + (speciesYield[id] ?? 6), 0) /
    Math.max(1, species.length);
  return Math.round(trees * average * (progress / 100));
}

export function ForestryTab() {
  const { snapshot, refresh, command } = useConsole();
  const now = useNow(10_000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  if (!snapshot) return null;

  // Get lumberjack turtles and their missions
  const lumberjacks = snapshot.turtles.filter((turtle) => turtle.role === "lumberjack");
  const timberMissions = snapshot.missions.filter((m) => isTimberSpec(m.spec));

  // Build board: latest mission per lumberjack
  const latestByTurtle = new Map<string, MissionSummary>();
  for (const mission of timberMissions) {
    if (!latestByTurtle.has(mission.turtleId)) latestByTurtle.set(mission.turtleId, mission);
  }

  const board = lumberjacks
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

  const running = timberMissions.filter((m) => m.state === "active").length;
  const queued = timberMissions.filter((m) => m.state === "offered").length;
  const logs = timberMissions.reduce((sum, m) => sum + getLogs(m.stats), 0);
  const replantRate = timberMissions.length
    ? Math.round((timberMissions.filter((m) => getReplant(m)).length / timberMissions.length) * 100)
    : 0;

  const pause = async (id: string) => {
    const turtle = snapshot.turtles.find((t) => t.missionId === id);
    if (turtle) await command(turtle.id, "return");
  };

  const resume = async (id: string) => {
    const turtle = snapshot.turtles.find((t) => t.missionId === id);
    if (turtle) await command(turtle.id, "start");
  };

  const runNow = async (id: string) => {
    const turtle = snapshot.turtles.find((t) => t.missionId === id);
    if (turtle) await command(turtle.id, "start");
  };

  const remove = (_id: string) => {
    // For real missions, we can't delete - they stay in history
    toast.message("Mission archived locally");
  };

  const addHarvest = () => {
    toast.message("Harvest creation not yet implemented", {
      description: "Use the Fleet tab to assign lumberjack role, then the server will auto-create missions.",
    });
    setFormOpen(false);
  };

  const startHarvest = async (turtleId: string) => {
    await command(turtleId, "start");
    await refresh();
  };

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="operations / 03 · forestry"
        title="Lumberjack crews, groves, and the walk home."
        description="The server assigns a deterministic timber mission. The turtle owns movement, fuel, and replant logic. Start, recall, or abort from this board."
        meta={
          <span>
            {running} running · {queued} queued · {lumberjacks.length} lumberjack{running || queued ? "" : " (assign in Fleet)"}
          </span>
        }
        actions={
          <>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus data-icon="inline-start" />
              Plan a harvest
            </Button>
          </>
        }
      />

      <StatBand
        items={[
          {
            label: "active crews",
            value: running,
            unit: "crews",
            hint: running ? "harvest running" : "no harvest running",
            tone: running ? "live" : "muted",
          },
          {
            label: "queued",
            value: queued,
            unit: "jobs",
            hint: queued ? "waiting for crew" : "queue empty",
            tone: queued ? "signal" : "muted",
          },
          {
            label: "logs this shift",
            value: formatNumber(logs),
            hint: "from turtle reports",
            tone: "signal",
          },
          {
            label: "replant policy",
            value: `${replantRate}%`,
            hint: "of jobs keep the grove",
            tone: replantRate >= 50 ? "live" : "warning",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <section className="flex flex-col gap-3">
          <SectionHead
            kicker="queue"
            title="Lumberjack missions"
            description="Latest plan per lumberjack. Select one to inspect the grove."
            action={
              <span className="mono text-[10px] text-muted-foreground">
                {formatNumber(timberMissions.reduce((sum, m) => sum + getLogs(m.stats), 0))} est. logs
              </span>
            }
          />

          {formOpen ? (
            <HarvestForm onCancel={() => setFormOpen(false)} onAdd={addHarvest} />
          ) : null}

          <div className="flex flex-col gap-2.5">
            {board.map((entry) => {
              const job = entry.mission;
              const turtle = entry.turtle;
              const isSelected = job?.id === selectedId;
              const onSelect = () => job && setSelectedId(job.id);
              const onPause = () => job && pause(job.id);
              const onResume = () => job && resume(job.id);
              const onRunNow = () => job && runNow(job.id);
              const onRemove = () => job && remove(job.id);
              return (
                <JobCard
                  key={job?.id ?? turtle.id}
                  job={job}
                  turtle={turtle}
                  selected={isSelected}
                  onSelect={onSelect}
                  onPause={onPause}
                  onResume={onResume}
                  onRunNow={onRunNow}
                  onRemove={onRemove}
                />
              );
            })}
          </div>

          {board.length === 0 ? (
            <EmptyState
              icon={Sprout}
              title="No lumberjacks assigned"
              description="Assign the lumberjack role in Fleet, then return here to dispatch harvests."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    window.location.hash = "fleet";
                  }}
                >
                  Open fleet
                </Button>
              }
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <Trees className="size-3 text-muted-foreground" aria-hidden="true" />
                <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {lumberjacks.length} lumberjack{lumberjacks.length !== 1 ? "s" : ""} ready
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                Assign a harvest from the queue or create a new one. The server builds a deterministic
                timber mission: wait for wood → collect → deposit → replant → repeat.
              </p>
            </div>
          )}
        </section>

        <section className="min-w-0">
          {selected ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-border/80 bg-card/40">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-4">
                  <div>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="display text-xl font-semibold">{selected.zone}</h2>
                      <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                        {selected.id} · {selected.grid}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5">
                        <StatusDot tone={missionMeta(selected.state).tone} pulse={selected.state === "active"} />
                        <span className="mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                          {missionMeta(selected.state).label}
                        </span>
                      </span>
                      <span className="mono text-[10px] text-muted-foreground">
                        {selected.createdAt
                          ? `started ${relativeTime(selected.createdAt, now)}`
                          : "not started"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-xl tabular-nums">{getProgressValue(selected.progress)}%</span>
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
                        : "bg-signal"
                    )}
                    style={{ width: `${Math.max(getProgressValue(selected.progress), 1)}%` }}
                  />
                </div>

                <div className="p-3 sm:p-4">
                  <GroveSchematic job={selected} />
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/70 p-4 sm:grid-cols-4">
                  <Readout label="radius" value={getRadius(selected)} unit="blocks" />
                  <Readout
                    label="logs"
                    value={formatNumber(getLogs(selected.stats))}
                    hint={`${formatNumber(jobYield(selected))} est. yield`}
                    tone="signal"
                  />
                  <Readout
                    label="planted"
                    value={getReplant(selected) ? getPlanted(selected.stats) : "—"}
                    hint={getReplant(selected) ? "saplings placed" : "clear cut"}
                    tone={getReplant(selected) ? "live" : "warning"}
                  />
                  <Readout
                    label="elapsed"
                    value={selected.createdAt ? formatDuration(now - selected.createdAt) : "—"}
                    hint="from turtle heartbeat"
                  />
                  <Readout label="deposit" value={getDeposit(selected)} />
                  <Readout label="species" value={getSpecies(selected).length} unit="types" />
                  <Readout
                    label="grove"
                    value={getReplant(selected) ? "sustained" : "clear cut"}
                    hint={getReplant(selected) ? "replant after felling" : "no replant pass"}
                    tone={getReplant(selected) ? "live" : "warning"}
                  />
                  <Readout
                    label="job state"
                    value={missionMeta(selected.state).label}
                    hint={selected.state === "active" ? "running on turtle" : "awaiting command"}
                  />
                </div>

                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-3">
                  <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Sprout className="size-3" aria-hidden="true" />
                    live from console
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selected.state === "active" ? (
                      <Button variant="outline" size="sm" onClick={() => pause(selected.id)}>
                        <Pause data-icon="inline-start" />
                        Pause
                      </Button>
                    ) : null}
                    {selected.state === "paused" ? (
                      <Button size="sm" onClick={() => resume(selected.id)}>
                        <Play data-icon="inline-start" />
                        Resume
                      </Button>
                    ) : null}
                    {selected.state === "offered" ? (
                      <Button size="sm" onClick={() => runNow(selected.id)}>
                        <Play data-icon="inline-start" />
                        Run now
                      </Button>
                    ) : null}
                    {selected.state !== "done" && selected.state !== "failed" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => remove(selected.id)}
                      >
                        <X data-icon="inline-start" />
                        Archive
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => remove(selected.id)}>
                        <Archive data-icon="inline-start" />
                        Archive
                      </Button>
                    )}
                    {selectedTurtle && selected.state !== "active" && selected.state !== "done" && selected.state !== "failed" && (
                      <Button size="sm" onClick={() => startHarvest(selectedTurtle.id)}>
                        <Loader2 data-icon="inline-start" className="mr-1 animate-spin" />
                        Start on turtle
                      </Button>
                    )}
                  </div>
                </footer>
              </div>

              <div className="rounded-xl border border-dashed border-border/70 px-4 py-3">
                <div className="mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  what the runtime does
                </div>
                <div className="mt-2 grid gap-2 text-[10px] leading-relaxed text-muted-foreground sm:grid-cols-3">
                  <p>Zone bounds and a safe path to the grove.</p>
                  <p>Sapling chests, replant policy, and a fuel reserve.</p>
                  <p>Deposit routing and a block budget per trip.</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Trees}
              title="Select a harvest"
              description="Pick a job from the queue to inspect the grove plan."
            />
          )}
        </section>
      </div>
    </div>
  );
}

function JobCard({
  job,
  turtle,
  selected,
  onSelect,
  onPause,
  onResume,
  onRunNow,
  onRemove,
}: {
  job: MissionSummary | undefined;
  turtle: any | null;
  selected: boolean;
  onSelect: () => void;
  onPause: () => void;
  onResume: () => void;
  onRunNow: () => void;
  onRemove: () => void;
}) {
  if (!job) return null;
  const meta = missionMeta(job.state);
  const radius = getRadius(job);
  const species = getSpecies(job);
  const replant = getReplant(job);
  const logs = getLogs(job.stats);
  const planted = getPlanted(job.stats);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/40 transition-colors",
        selected ? "border-signal/55 bg-signal/[0.045]" : "border-border/80 hover:border-border"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="block w-full px-3.5 pb-3 pt-3.5 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {job.id}
              </span>
              <StatusDot tone={meta.tone} pulse={job.state === "active"} />
              <span className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                {meta.label}
              </span>
            </div>
            <div className="display mt-1 truncate text-[14px] font-semibold">{job.zone}</div>
            <div className="mono mt-0.5 text-[9px] text-muted-foreground">{job.grid}</div>
            {turtle && (
              <div className="mt-1 flex items-center gap-2">
                <TurtleChip turtle={turtle} size="sm" showRole={false} />
                <span className="truncate text-[11px]">{turtleName(turtle)}</span>
              </div>
            )}
          </div>
          <div className="mono shrink-0 text-sm tabular-nums text-foreground/90">
            {getProgressValue(job.progress)}%
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {species.map((id: string) => (
            <span key={id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: speciesColor[id] }}
                aria-hidden="true"
              />
              {id.replace("_", " ")}
            </span>
          ))}
          {replant ? (
            <span className="mono text-[9px] text-live/80">replant</span>
          ) : (
            <span className="mono text-[9px] text-warning/80">clear cut</span>
          )}
        </div>

        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700",
              job.state === "paused"
                ? "bg-warning"
                : job.state === "done" || job.state === "failed"
                ? "bg-live"
                : "bg-signal"
            )}
            style={{ width: `${Math.max(getProgressValue(job.progress), 1)}%` }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="mono text-[9px] text-muted-foreground">
            {formatNumber(logs)} logs · r{radius}
          </span>
          <span className="mono text-[9px] text-muted-foreground">
            {replant ? `${planted} planted` : "no replant"}
          </span>
        </div>
      </button>

      <div className="flex items-center justify-between border-t border-border/60 px-3.5 py-2">
        <span className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">
          live
        </span>
        <div className="flex items-center gap-1">
          {job.state === "active" ? (
            <Button variant="ghost" size="xs" onClick={onPause}>
              <Pause data-icon="inline-start" />
              Pause
            </Button>
          ) : null}
          {job.state === "paused" ? (
            <Button variant="ghost" size="xs" onClick={onResume}>
              <Play data-icon="inline-start" />
              Resume
            </Button>
          ) : null}
          {job.state === "offered" ? (
            <Button variant="ghost" size="xs" onClick={onRunNow}>
              <Play data-icon="inline-start" />
              Run now
            </Button>
          ) : null}
          {job.state === "done" || job.state === "failed" ? (
            <Button variant="ghost" size="xs" onClick={onRemove}>
              <Archive data-icon="inline-start" />
              Archive
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              <X data-icon="inline-start" />
              Archive
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function HarvestForm({
  onAdd,
  onCancel,
}: {
  onAdd: () => void;
  onCancel: () => void;
}) {
  const [zone, setZone] = useState("");
  const [radius, setRadius] = useState("32");
  const [species, setSpecies] = useState<string[]>(["oak", "birch"]);
  const [replant, setReplant] = useState(true);
  const [deposit, setDeposit] = useState("S04 · output chest");
  const [error, setError] = useState("");

  const SPECIES = ["oak", "birch", "spruce", "acacia", "dark_oak"];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = zone.trim();
    if (!clean) {
      setError("Give the grove a call sign.");
      return;
    }
    const value = Number(radius);
    if (!Number.isFinite(value) || value < 8 || value > 48) {
      setError("Radius must be between 8 and 48 blocks.");
      return;
    }
    if (species.length === 0) {
      setError("Choose at least one species.");
      return;
    }
    setError("");
    onAdd();
    toast.success("Harvest queued (placeholder)", {
      description: `${clean} · feature not yet implemented.`,
    });
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-signal/30 bg-card/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono text-[9px] uppercase tracking-[0.16em] text-signal">new harvest</div>
          <h3 className="display mt-1 text-base font-semibold">Plan a grove run</h3>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Close form">
          <X />
        </Button>
      </div>

      <FieldGroup className="mt-4 gap-3">
        <Field>
          <FieldLabel htmlFor="harvest-zone" className="mono text-[10px] uppercase tracking-[0.12em]">
            grove call sign
          </FieldLabel>
          <Input
            id="harvest-zone"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            placeholder="e.g. Cedar Hollow"
            aria-invalid={Boolean(error)}
          />
          <FieldDescription>Shown on the queue and in the grove plan.</FieldDescription>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="harvest-radius" className="mono text-[10px] uppercase tracking-[0.12em]">
              radius
            </FieldLabel>
            <Input
              id="harvest-radius"
              type="number"
              min={8}
              max={48}
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
            />
            <FieldDescription>8 to 48 blocks from the crew marker.</FieldDescription>
          </Field>

          <Field orientation="horizontal" className="items-center justify-between rounded-lg border border-border/70 px-3 py-2">
            <FieldContent>
              <FieldLabel htmlFor="harvest-replant" className="mono text-[10px] uppercase tracking-[0.12em]">
                replant
              </FieldLabel>
              <FieldDescription>Queue a sapling pass after felling.</FieldDescription>
            </FieldContent>
            <Switch id="harvest-replant" checked={replant} onCheckedChange={setReplant} />
          </Field>
        </div>

        <Field>
          <FieldLabel className="mono text-[10px] uppercase tracking-[0.12em]">
            species mix
          </FieldLabel>
          <ToggleGroup type="multiple" variant="outline" value={species} onValueChange={(value) => setSpecies(value as string[])} className="flex flex-wrap justify-start">
            {SPECIES.map((entry) => (
              <ToggleGroupItem key={entry} value={entry} className="gap-1.5 text-[11px]">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: speciesColor[entry] }} aria-hidden="true" />
                {entry.replace("_", " ")}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>Yield estimates use the species mix.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="harvest-deposit" className="mono text-[10px] uppercase tracking-[0.12em]">
            deposit
          </FieldLabel>
          <Input
            id="harvest-deposit"
            value={deposit}
            onChange={(event) => setDeposit(event.target.value)}
            placeholder="station output chest"
          />
        </Field>

        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="mono text-[9px] text-muted-foreground">not yet implemented</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            <Plus data-icon="inline-start" />
            Queue harvest
          </Button>
        </div>
      </div>
    </form>
  );
}