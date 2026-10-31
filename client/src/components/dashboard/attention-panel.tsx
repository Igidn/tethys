import { CircleAlert, Info, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Issue, IssueSeverity } from "@/lib/attention";
import { useConsole } from "@/lib/use-console";
import { Button } from "@/components/ui/button";
import { TurtleChip } from "@/components/common/turtle-chip";
import { toneSurface } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";

const severityCopy: Record<
  IssueSeverity,
  { label: string; icon: typeof TriangleAlert; tone: "danger" | "warning" | "info" }
> = {
  danger: { label: "critical", icon: TriangleAlert, tone: "danger" },
  warning: { label: "attention", icon: CircleAlert, tone: "warning" },
  info: { label: "note", icon: Info, tone: "info" },
};

export function AttentionPanel({ issues }: { issues: Issue[] }) {
  const { command, isPending, snapshot } = useConsole();
  const alerts = issues.filter((issue) => issue.severity !== "info");
  const notes = issues.filter((issue) => issue.severity === "info");

  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card/50">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(560px_240px_at_0%_0%,oklch(0.79_0.145_78/0.07),transparent_72%)]"
        aria-hidden="true"
      />
      <header className="relative flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-signal">needs you</div>
          <h2 className="display mt-1.5 text-xl font-semibold">
            {alerts.length
              ? `${alerts.length} decision${alerts.length === 1 ? "" : "s"} on the board`
              : "No interventions queued"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Faults and operator decisions outrank throughput.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              online
            </div>
            <div className="mono mt-0.5 text-sm tabular-nums">
              {snapshot?.counts.online ?? 0}/{snapshot?.counts.turtles ?? 0}
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              notes
            </div>
            <div className="mono mt-0.5 text-sm tabular-nums">{notes.length}</div>
          </div>
        </div>
      </header>

      {issues.length === 0 ? (
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="grid size-12 place-items-center rounded-full border border-live/30 bg-live/10 text-live">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div className="display mt-4 text-lg font-semibold">The fleet is quiet</div>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Every connected turtle has fuel, cargo room, and a mission that is moving. Leave it
            alone and let the shafts grow.
          </p>
        </div>
      ) : (
        <>
          <div className="relative flex-1 divide-y divide-border/60 xl:max-h-[326px] xl:overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-4 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-live" aria-hidden="true" />
                No urgent decisions. The notes below are context, not action.
              </div>
            ) : null}
            {alerts.map((issue) => {
              const meta = severityCopy[issue.severity];
              const Icon = meta.icon;
              const pending = issue.action
                ? isPending(issue.turtle.id, issue.action.op)
                : false;
              return (
                <div
                  key={issue.id}
                  className="flex flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-accent/20 sm:flex-row sm:items-center"
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-md border",
                      toneSurface[meta.tone],
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="size-3.5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[13px] font-medium text-foreground">{issue.title}</span>
                      <span
                        className={cn(
                          "mono text-[9px] uppercase tracking-[0.12em]",
                          meta.tone === "danger"
                            ? "text-destructive"
                            : meta.tone === "warning"
                              ? "text-warning"
                              : "text-info",
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {issue.detail}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 sm:pl-2">
                    <div className="flex items-center gap-2">
                      <TurtleChip turtle={issue.turtle} size="sm" />
                      <span className="hidden max-w-[92px] truncate text-[11px] text-muted-foreground sm:block">
                        {issue.name}
                      </span>
                    </div>
                    {issue.action ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => void command(issue.turtle.id, issue.action!.op, issue.name)}
                      >
                        {pending ? <Spinner data-icon="inline-start" /> : null}
                        {issue.action.label}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {notes.length > 0 ? (
            <div className="relative border-t border-border/70 bg-background/20 px-5 py-3">
              <div className="mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                context notes
              </div>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {notes.map((note) => (
                  <div key={note.id} className="flex min-w-0 items-center gap-2 text-[11px]" title={note.detail}>
                    <Info className="size-3 shrink-0 text-info" aria-hidden="true" />
                    <span className="truncate text-muted-foreground">{note.title}</span>
                    <span className="mono ml-auto shrink-0 text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">
                      {note.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function FleetReadiness({ issues }: { issues: Issue[] }) {
  const { snapshot } = useConsole();
  if (!snapshot) return null;

  const issueIds = new Set(issues.filter((issue) => issue.severity !== "info").map((issue) => issue.turtle.id));
  const operational = (snapshot.turtles ?? []).filter(
    (turtle) => snapshot.online.includes(turtle.id) && !issueIds.has(turtle.id),
  ).length;
  const total = (snapshot.turtles ?? []).length;
  const segments = 18;
  const filled = total === 0 ? 0 : Math.round((operational / total) * segments);

  const rows = [...(snapshot.turtles ?? [])]
    .sort((a, b) => {
      const aAlert = issueIds.has(a.id) ? 0 : 1;
      const bAlert = issueIds.has(b.id) ? 0 : 1;
      return aAlert - bAlert;
    })
    .slice(0, 5);

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            fleet readiness
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="display text-lg font-semibold">{operational}</span>
            <span className="text-xs text-muted-foreground">of {total} operational</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.hash = "fleet";
          }}
          className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-signal"
        >
          open fleet
        </button>
      </div>

      <div className="mt-3 flex gap-0.5" aria-hidden="true">
        {Array.from({ length: segments }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-[1px]",
              index < filled ? "bg-live" : "bg-muted",
            )}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col divide-y divide-border/60">
        {rows.length === 0 ? (
          <p className="py-4 text-xs text-muted-foreground">No robots on the wire yet.</p>
        ) : (
          rows.map((turtle) => {
            const online = snapshot.online.includes(turtle.id);
            const mission = snapshot.missions.find((entry) => entry.id === turtle.missionId);
            const issue = issues.find((entry) => entry.turtle.id === turtle.id);
            return (
              <button
                key={turtle.id}
                type="button"
                onClick={() => {
                  window.location.hash = "fleet";
                }}
                className="group flex items-center gap-3 py-2.5 text-left first:pt-1 last:pb-0"
              >
                <TurtleChip turtle={turtle} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[12px] font-medium">
                      {turtle.label || `turtle-${turtle.computerId ?? turtle.id.slice(0, 4)}`}
                    </span>
                    <span
                      className={cn(
                        "mono text-[9px]",
                        !online
                          ? "text-muted-foreground"
                          : issue?.severity === "danger"
                            ? "text-destructive"
                            : issue?.severity === "warning"
                              ? "text-warning"
                              : "text-live",
                      )}
                    >
                      {online ? (issue ? issue.title.toLowerCase() : turtle.state) : "offline"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-signal/80 transition-[width] duration-700"
                        style={{ width: `${mission ? Math.max(1, mission.percent) : 0}%` }}
                      />
                    </div>
                    <span className="mono text-[9px] tabular-nums text-muted-foreground">
                      {mission ? `${Math.round(mission.percent)}%` : "idle"}
                    </span>
                  </div>
                </div>
                <span className="mono hidden text-[10px] tabular-nums text-muted-foreground sm:block">
                  {typeof turtle.fuel === "number" ? turtle.fuel : "∞"}
                </span>
              </button>
            );
          })
        )}
      </div>
      {snapshot.turtles.length > rows.length ? (
        <div className="mono mt-2 text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
          +{snapshot.turtles.length - rows.length} more in fleet
        </div>
      ) : null}
    </section>
  );
}
