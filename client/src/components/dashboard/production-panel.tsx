import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Gauge } from "lucide-react";
import { formatClock, formatNumber, itemTone, prettyItem, relativeTime } from "@/lib/format";
import { useConsole, useNow } from "@/lib/use-console";
import type { EventRecord } from "@/lib/types";
import { Readout } from "@/components/common/readout";
import { StatusDot } from "@/components/common/status-dot";

type TipProps = {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: string | number;
};

function OreTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-lg">
      <div className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mono mt-0.5 text-xs text-signal">
        {payload[0]?.value ?? 0} ore report{payload[0]?.value === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export function ProductionPanel() {
  const { snapshot } = useConsole();
  const now = useNow(30_000);
  const events = snapshot?.events;

  const bins = useMemo(() => {
    const size = 2 * 60 * 60_000;
    const span = 24 * 60 * 60_000;
    const start = Math.floor((now - span) / size) * size;
    const rows = Array.from({ length: 12 }, (_, index) => {
      const at = start + index * size;
      return { label: formatClock(at).slice(0, 5), count: 0 };
    });
    for (const event of events ?? []) {
      if (event.kind !== "ore" || event.at < start) continue;
      const index = Math.min(11, Math.max(0, Math.floor((event.at - start) / size)));
      rows[index].count += 1;
    }
    return rows;
  }, [events, now]);

  if (!snapshot) return null;

  const totalRecent = bins.reduce((sum, bin) => sum + bin.count, 0);
  const topOres = snapshot.ores.slice(0, 5);
  const maxOre = topOres[0]?.count ?? 1;

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            production
          </div>
          <h2 className="display mt-1 text-lg font-semibold">Ore finds and ledger</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reports from the last 24 hours, plus every logged ore cell.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Readout
            label="last 24h"
            value={totalRecent}
            unit="finds"
            tone={totalRecent > 0 ? "signal" : "muted"}
          />
          <Readout label="all time" value={formatNumber(snapshot.counts.ores)} unit="cells" />
        </div>
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="min-w-0">
          {totalRecent === 0 ? (
            <div className="console-grid relative flex h-[186px] flex-col items-center justify-center rounded-lg border border-dashed border-border/70">
              <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
              <p className="display mt-2 text-sm font-medium">No ore reports in this window</p>
              <p className="mt-1 max-w-xs text-center text-[11px] text-muted-foreground">
                A quiet shift, or the turtle link is down. The ledger on the right keeps the
                all-time record.
              </p>
            </div>
          ) : (
            <div className="h-[186px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={bins} margin={{ top: 8, right: 6, bottom: 0, left: -28 }}>
                  <defs>
                    <linearGradient id="ore-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--signal)" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="var(--signal)" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeOpacity={0.55}
                    strokeDasharray="2 7"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                    tick={{
                      fontSize: 9,
                      fill: "var(--muted-foreground)",
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                    tick={{
                      fontSize: 9,
                      fill: "var(--muted-foreground)",
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                  <Tooltip content={<OreTooltip />} cursor={{ stroke: "var(--border)" }} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--signal)"
                    strokeWidth={1.6}
                    fill="url(#ore-fill)"
                    dot={false}
                    activeDot={{
                      r: 3,
                      fill: "var(--signal)",
                      stroke: "var(--background)",
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
            <Readout label="mission blocks" value={formatNumber(snapshot.counts.blocks)} />
            <Readout label="trips logged" value={formatNumber(snapshot.counts.trips)} />
            <Readout
              label="ore cells"
              value={formatNumber(snapshot.counts.ores)}
              tone="signal"
            />
          </div>
        </div>

        <div className="min-w-0">
          <div className="mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            ore ledger
          </div>
          {topOres.length === 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              No ore has been mapped yet. Vein reports appear here after the first trip.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-2.5">
              {topOres.map((ore) => (
                <div key={ore.name}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: itemTone(ore.name) }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-[11px] text-foreground/85">
                        {prettyItem(ore.name)}
                      </span>
                    </span>
                    <span className="mono text-[10px] tabular-nums text-muted-foreground">
                      {ore.count}
                    </span>
                  </div>
                  <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, (ore.count / maxOre) * 100)}%`,
                        backgroundColor: itemTone(ore.name),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function eventDetail(event: EventRecord): string {
  const data = (event.data ?? {}) as Record<string, unknown>;
  if (event.kind === "ore") {
    const name = data.name ? prettyItem(String(data.name)) : "ore";
    const x = data.x ?? "?";
    const y = data.y ?? "?";
    const z = data.z ?? "?";
    return `${name} · ${x}, ${y}, ${z}`;
  }
  if (event.kind === "mission_result") {
    const status = String(data.status ?? "result");
    const error = data.error ? ` · ${String(data.error)}` : "";
    return `${status}${error}`;
  }
  if (event.kind === "role_changed") return `role → ${String(data.role ?? "?")}`;
  if (event.kind === "renamed") return `call sign → ${String(data.label ?? "cleared")}`;
  if (event.kind === "connected") return `firmware ${String(data.fw ?? "unknown")}`;
  if (event.kind === "registered") return `station ${String(data.station ?? "?")}`;
  const text = JSON.stringify(data);
  return text === "{}" ? "no payload" : text.slice(0, 90);
}

export function ActivityFeed() {
  const { snapshot } = useConsole();
  const now = useNow(10_000);
  if (!snapshot) return null;

  const events = (snapshot.events ?? []).slice(0, 8);
  const turtles = new Map(
    (snapshot.turtles ?? []).map((turtle) => [turtle.id, turtle.label || turtle.id.slice(0, 6)]),
  );

  return (
    <section className="flex h-full flex-col rounded-xl border border-border/80 bg-card/30 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            live activity
          </div>
          <h2 className="display mt-1 text-lg font-semibold">What just happened</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.hash = "events";
          }}
          className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-signal"
        >
          full log
        </button>
      </div>

      {events.length === 0 ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
          <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-xs text-muted-foreground">No events yet.</p>
        </div>
      ) : (
        <div className="relative mt-4 flex-1">
          <div className="absolute bottom-2 left-[5px] top-2 w-px bg-border/70" aria-hidden="true" />
          <div className="flex flex-col gap-3.5">
            {events.map((event) => {
              const tone =
                event.kind === "fault" || event.kind === "recovery_failed"
                  ? "danger"
                  : event.kind === "mission_result" && (event.data as { status?: string })?.status === "failed"
                    ? "danger"
                    : event.kind === "ore"
                      ? "signal"
                      : event.kind === "disconnected"
                        ? "warning"
                        : event.kind === "connected"
                          ? "live"
                          : "muted";
              return (
                <div key={event.id} className="relative pl-5">
                  <span className="absolute left-0 top-1.5">
                    <StatusDot tone={tone} />
                  </span>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                      {formatClock(event.at)}
                    </span>
                    <span className="mono text-[9px] text-muted-foreground/70" title={turtles.get(event.turtleId ?? "")}>
                      {turtles.get(event.turtleId ?? "") ?? (event.turtleId ? event.turtleId.slice(0, 6) : "unknown")}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-foreground/85">
                    {eventDetail(event)}
                  </div>
                  <div className="mono text-[9px] text-muted-foreground/60">
                    {relativeTime(event.at, now)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
