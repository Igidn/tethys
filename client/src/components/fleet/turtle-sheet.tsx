import { useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Pause,
  Radio,
  Save,
  ShieldAlert,
  Trees,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  eventMeta,
  formatDateTime,
  inventoryStats,
  poseLabel,
  relativeTime,
  roleLabel,
  roleTone,
  shortId,
  stateMeta,
  stationLabel,
  turtleName,
} from "@/lib/format";
import { eventSummary } from "@/lib/event-text";
import { cn } from "@/lib/utils";
import type { PublicTurtle, TurtleRole } from "@/lib/types";
import { useConsole, useNow } from "@/lib/use-console";
import { TurtleChip } from "@/components/common/turtle-chip";
import { FuelBar } from "@/components/common/fuel-bar";
import { StatusDot } from "@/components/common/status-dot";
import { Readout } from "@/components/common/readout";
import { MissionControls } from "@/components/mining/mission-controls";
import { InventoryList } from "@/components/fleet/inventory-list";
import { isBranchMineSpec, isMiningProgress } from "../../lib/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";

export function TurtleSheet({
  turtle,
  open,
  onClose,
}: {
  turtle?: PublicTurtle;
  open: boolean;
  onClose: () => void;
}) {
  const { snapshot, command, updateTurtle, isPending } = useConsole();
  const [label, setLabel] = useState(turtle?.label ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const now = useNow(10_000);

  useEffect(() => {
    setLabel(turtle?.label ?? "");
    setCopied(false);
  }, [turtle?.id, turtle?.label]);

  if (!snapshot || !turtle) {
    return (
      <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-lg" />
      </Sheet>
    );
  }

  const online = snapshot.online.includes(turtle.id);
  const station = snapshot.stations.find((entry) => entry.id === turtle.stationId);
  const latest =
    snapshot.missions.find((mission) => mission.id === turtle.missionId) ??
    snapshot.missions.find((mission) => mission.turtleId === turtle.id);
  const meta = stateMeta(turtle.state, online);
  const hold = inventoryStats(turtle.inventory);
  const events = (snapshot.events ?? []).filter((event) => event.turtleId === turtle.id).slice(0, 7);
  const pingPending = isPending(turtle.id, "ping");
  const stations = [...(snapshot.stations ?? [])].sort((a, b) => a.index - b.index);
  const stationLocked = Boolean(
    latest && (latest.state === "active" || latest.state === "offered" || latest.state === "paused"),
  );

  const saveLabel = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await updateTurtle(turtle.id, { label });
    setSaving(false);
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(turtle.id);
      setCopied(true);
      toast.success("Turtle id copied");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/70 px-5 py-5">
          <div className="flex items-start gap-3 pr-8">
            <TurtleChip turtle={turtle} size="lg" />
            <div className="min-w-0 flex-1">
              <SheetTitle className="display flex flex-wrap items-center gap-2 text-xl font-semibold">
                {turtleName(turtle)}
                <span className="mono text-[9px] font-normal uppercase tracking-[0.12em] text-muted-foreground">
                  {turtle.computerId ? `computer ${turtle.computerId}` : "no computer id"}
                </span>
              </SheetTitle>
              <SheetDescription className="sr-only">
                Turtle detail, cargo, mission, and recent events.
              </SheetDescription>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyId()}
                  className="mono flex items-center gap-1 text-[9px] text-muted-foreground transition-colors hover:text-foreground"
                  title={turtle.id}
                >
                  {shortId(turtle.id)}
                  {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
                </button>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex items-center gap-1.5">
                  <StatusDot tone={meta.tone} pulse={online && meta.tone === "live"} />
                  <span className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    {meta.label}
                  </span>
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex items-center gap-1.5">
                  <StatusDot tone={roleTone(turtle.role)} />
                  <span className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    {roleLabel(turtle.role)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!online || pingPending}
              onClick={() => void command(turtle.id, "ping", turtleName(turtle))}
              title={online ? "Ask for a fresh hello" : "Turtle is offline"}
            >
              {pingPending ? <Spinner data-icon="inline-start" /> : <Radio data-icon="inline-start" />}
              Ping
            </Button>
            <MissionControls turtle={turtle} mission={latest} online={online} />
            {turtle.role === "lumberjack" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.location.hash = "forestry";
                  onClose();
                }}
              >
                <Trees data-icon="inline-start" />
                Forestry preview
              </Button>
            ) : null}
            {!online ? (
              <span className="mono flex items-center gap-1.5 text-[9px] text-warning">
                <ShieldAlert className="size-3" aria-hidden="true" />
                commands will not reach it
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border/70 bg-card/30 p-4">
            <Readout
              label="station"
              value={station ? `S${String(station.index).padStart(2, "0")}` : "unassigned"}
              hint={
                station
                  ? `anchor ${station.anchor.x}, ${station.anchor.y}, ${station.anchor.z}`
                  : "no station record"
              }
            />
            <Readout label="pose" value={poseLabel(turtle.pose)} />
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                fuel
              </div>
              <div className="mt-1.5">
                <FuelBar fuel={turtle.fuel} reserve={snapshot.config.reserve} />
              </div>
              <div className="mono mt-1 text-[10px] text-muted-foreground">
                reserve {snapshot.config.reserve}
              </div>
            </div>
            <Readout
              label="last seen"
              value={relativeTime(turtle.lastSeen, now)}
              hint={formatDateTime(turtle.lastSeen)}
            />
          </div>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                mission
              </h3>
              {latest ? (
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = "mining";
                    onClose();
                  }}
                  className="mono flex items-center gap-1 text-[9px] text-muted-foreground transition-colors hover:text-signal"
                >
                  inspect in mining
                  <ExternalLink className="size-2.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            {latest ? (
              <div className="mt-2 rounded-lg border border-border/70 bg-card/30 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <StatusDot
                      tone={
                        latest.state === "failed"
                          ? "danger"
                          : latest.state === "paused"
                            ? "warning"
                            : latest.state === "done"
                              ? "live"
                              : "signal"
                      }
                      pulse={online && latest.state === "active"}
                    />
                    <span className="mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {latest.state}
                    </span>
                    <span className="mono text-[9px] text-muted-foreground/60">
                      {latest.id.slice(0, 8)}
                    </span>
                  </span>
                  <span className="mono text-sm tabular-nums">{Math.round(latest.percent)}%</span>
                </div>
                <Progress
                  value={latest.percent}
                  className={cn(
                    "mt-2",
                    latest.state === "failed"
                      ? "[&_[data-slot=progress-indicator]]:bg-destructive"
                      : latest.state === "paused"
                        ? "[&_[data-slot=progress-indicator]]:bg-warning"
                        : latest.state === "done"
                          ? "[&_[data-slot=progress-indicator]]:bg-live"
                          : "",
                  )}
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Readout label="blocks" value={latest.stats.blocks.toLocaleString()} />
                  <Readout label="ores" value={latest.stats.ores} tone="signal" />
                  <Readout label="trips" value={latest.stats.trips} />
                </div>
                {isBranchMineSpec(latest.spec) && isMiningProgress(latest.progress) ? (
                  <div className="mono mt-2 text-[9px] text-muted-foreground">
                    layer {latest.progress.layer + 1}/{latest.plan.layers} · strip{" "}
                    {latest.progress.strip + 1}/{latest.plan.strips} · updated{" "}
                    {relativeTime(latest.updatedAt, now)}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3.5 py-4">
                <Pause className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="text-[11px] text-muted-foreground">
                  {turtle.role === "miner"
                    ? "No branch-mine mission has been created for this station."
                    : `${roleLabel(turtle.role)} work has no runtime yet.`}
                </span>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                cargo
              </h3>
              <span className="mono text-[9px] text-muted-foreground">
                {hold.slots}/{hold.capacity} slots · {hold.total} items
              </span>
            </div>
            <div className="mt-2">
              <InventoryList inventory={turtle.inventory} />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                identity
              </h3>
              <span className="mono text-[9px] text-muted-foreground">
                {roleLabel(turtle.role)}
              </span>
            </div>
            <form onSubmit={saveLabel} className="mt-2">
              <FieldGroup className="gap-3">
                <Field>
                  <FieldLabel
                    htmlFor="turtle-label"
                    className="mono text-[10px] uppercase tracking-[0.12em]"
                  >
                    call sign
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="turtle-label"
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="unassigned"
                      maxLength={40}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={saving || label.trim() === (turtle.label ?? "")}
                    >
                      {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                      Save
                    </Button>
                  </div>
                  <FieldDescription>
                    Local console label. The turtle keeps its own computer label.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="turtle-role"
                    className="mono text-[10px] uppercase tracking-[0.12em]"
                  >
                    role
                  </FieldLabel>
                  <Select
                    value={turtle.role}
                    onValueChange={(value) =>
                      void updateTurtle(turtle.id, { role: value as TurtleRole })
                    }
                  >
                    <SelectTrigger id="turtle-role" className="w-full">
                      <SelectValue placeholder="choose a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="miner">miner</SelectItem>
                      <SelectItem value="lumberjack">lumberjack</SelectItem>
                      <SelectItem value="hauler">hauler</SelectItem>
                      <SelectItem value="unassigned">unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Roles drive readiness counts and future work routing.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="turtle-station"
                    className="mono text-[10px] uppercase tracking-[0.12em]"
                  >
                    station
                  </FieldLabel>
                  <Select
                    value={turtle.stationId}
                    onValueChange={(value) =>
                      void updateTurtle(turtle.id, { stationId: value })
                    }
                    disabled={stationLocked}
                  >
                    <SelectTrigger id="turtle-station" className="w-full">
                      <SelectValue placeholder="choose a station" />
                    </SelectTrigger>
                    <SelectContent>
                      {stations.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {stationLabel(entry.index, entry.id)} · {entry.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {stationLocked
                      ? "Stop the active mission before moving this turtle to another station."
                      : "Miners and haulers use this station's anchor, shaft, and chests."}
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                recent events
              </h3>
              <button
                type="button"
                onClick={() => {
                  window.location.hash = "events";
                  onClose();
                }}
                className="mono text-[9px] text-muted-foreground transition-colors hover:text-signal"
              >
                full log
              </button>
            </div>
            {events.length === 0 ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3.5 py-4">
                <Wrench className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="text-[11px] text-muted-foreground">No events for this turtle.</span>
              </div>
            ) : (
              <div className="mt-2 flex flex-col divide-y divide-border/50 rounded-lg border border-border/70 bg-card/30">
                {events.map((event) => {
                  const meta = eventMeta(event.kind, event.data);
                  return (
                    <div key={event.id} className="flex items-start gap-2.5 px-3 py-2.5">
                      <StatusDot tone={meta.tone} className="mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                            {meta.label}
                          </span>
                          <span className="mono text-[9px] text-muted-foreground/60">
                            {relativeTime(event.at, now)}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-foreground/80">
                          {eventSummary(event)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5">
            <FieldContent className="gap-0">
              <div className="text-[11px] text-muted-foreground">
                Registered {formatDateTime(turtle.createdAt)}
              </div>
              <div className="mono text-[9px] text-muted-foreground/60">
                id {turtle.id}
              </div>
            </FieldContent>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
