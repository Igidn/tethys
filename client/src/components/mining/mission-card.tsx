import { cn } from "@/lib/utils";
import { missionMeta, poseLabel, relativeTime, turtleName } from "@/lib/format";
import type { MissionSummary, PublicTurtle } from "@/lib/types";
import { useConsole } from "@/lib/use-console";
import { TurtleChip } from "@/components/common/turtle-chip";
import { FuelBar } from "@/components/common/fuel-bar";
import { StatusDot } from "@/components/common/status-dot";
import { MissionControls } from "./mission-controls";

export function MissionCard({
  turtle,
  mission,
  selected,
  onSelect,
}: {
  turtle: PublicTurtle;
  mission?: MissionSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const { snapshot, isPending } = useConsole();
  const online = snapshot?.online.includes(turtle.id) ?? false;
  const reserve = snapshot?.config.reserve ?? 64;
  const state = mission ? missionMeta(mission.state) : { label: "no mission", tone: "muted" as const };
  const pending = isPending(turtle.id, "start") || isPending(turtle.id, "return");

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/40 transition-colors",
        selected ? "border-signal/55 bg-signal/[0.045]" : "border-border/80 hover:border-border",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="block w-full px-3.5 pb-3 pt-3.5 text-left"
      >
        <div className="flex items-start gap-3">
          <TurtleChip turtle={turtle} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-medium">{turtleName(turtle)}</span>
              <span className="mono text-[9px] text-muted-foreground">
                S{String(snapshot?.stations.find((s) => s.id === turtle.stationId)?.index ?? 0).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <StatusDot tone={state.tone} pulse={online && mission?.state === "active"} />
              <span className={cn("mono text-[9px] uppercase tracking-[0.1em]", state.tone === "danger" ? "text-destructive" : state.tone === "warning" ? "text-warning" : state.tone === "signal" ? "text-signal" : state.tone === "live" ? "text-live" : "text-muted-foreground")}>
                {mission ? state.label : online ? "idle" : "offline"}
              </span>
              {!online ? (
                <span className="mono text-[9px] text-muted-foreground">
                  · {relativeTime(turtle.lastSeen)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-sm tabular-nums text-foreground/90">
              {mission ? `${Math.round(mission.percent)}%` : "—"}
            </div>
            <div className="mono text-[9px] text-muted-foreground">
              {mission ? `${mission.stats.trips} trips` : "no plan"}
            </div>
          </div>
        </div>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700",
              mission?.state === "failed"
                ? "bg-destructive"
                : mission?.state === "paused"
                  ? "bg-warning"
                  : "bg-signal",
            )}
            style={{ width: `${mission ? Math.max(mission.percent, 1) : 0}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">blocks</div>
            <div className="mono mt-0.5 text-[11px] tabular-nums">
              {mission ? mission.stats.blocks.toLocaleString() : "0"}
              <span className="text-muted-foreground/60">
                /{mission ? Math.round(mission.blocksTotal / 1000) : 0}k
              </span>
            </div>
          </div>
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">ores</div>
            <div className="mono mt-0.5 text-[11px] tabular-nums">{mission?.stats.ores ?? 0}</div>
          </div>
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">pose</div>
            <div className="mono mt-0.5 truncate text-[11px] text-muted-foreground">
              {poseLabel(turtle.pose)}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <FuelBar fuel={turtle.fuel} reserve={reserve} segments={10} />
        </div>
      </button>

      <div className="flex items-center justify-between border-t border-border/60 px-3.5 py-2">
        <span className="mono text-[9px] text-muted-foreground">
          {pending ? "command in flight" : online ? "link up" : "link down"}
        </span>
        <MissionControls turtle={turtle} mission={mission} online={online} compact />
      </div>
    </div>
  );
}
