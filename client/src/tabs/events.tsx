import { useMemo, useState } from "react";
import {
  ChevronRight,
  Copy,
  FilterX,
  Pause,
  Play,
  ScrollText,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  dayLabel,
  eventMeta,
  formatClock,
  formatDateTime,
  relativeTime,
  turtleName,
} from "@/lib/format";
import { eventPayload, eventSummary } from "@/lib/event-text";
import { cn } from "@/lib/utils";
import type { EventRecord } from "@/lib/types";
import { useConsole, useNow } from "@/lib/use-console";
import { PageHeader } from "@/components/common/page-header";
import { StatBand } from "@/components/common/stat-band";
import { EmptyState } from "@/components/common/empty-state";
import { StatusDot } from "@/components/common/status-dot";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function EventsTab() {
  const { snapshot } = useConsole();
  const now = useNow(15_000);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [turtleId, setTurtleId] = useState("all");
  const [frozen, setFrozen] = useState(false);
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const [frozenEvents, setFrozenEvents] = useState<EventRecord[] | null>(null);

  const turtleNames = useMemo(
    () => new Map((snapshot?.turtles ?? []).map((turtle) => [turtle.id, turtleName(turtle)])),
    [snapshot?.turtles],
  );

  const kinds = useMemo(() => {
    const set = new Set<string>();
    for (const event of snapshot?.events ?? []) set.add(event.kind);
    return [...set].sort();
  }, [snapshot?.events]);

  if (!snapshot) return null;

  const source = frozen ? (frozenEvents ?? []) : snapshot.events;

  const search = query.trim().toLowerCase();
  const filtered = source.filter((event) => {
    if (kind !== "all" && event.kind !== kind) return false;
    if (turtleId !== "all" && event.turtleId !== turtleId) return false;
    if (!search) return true;
    const haystack = [
      event.kind,
      eventSummary(event),
      turtleNames.get(event.turtleId) ?? event.turtleId,
      JSON.stringify(event.data ?? {}),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });

  const groups: { label: string; events: EventRecord[] }[] = [];
  for (const event of filtered) {
    const label = dayLabel(event.at, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }

  const hourAgo = now - 3_600_000;
  const dayAgo = now - 86_400_000;
  const lastHour = (snapshot.events ?? []).filter((event) => event.at >= hourAgo).length;
  const faults = (snapshot.events ?? []).filter(
    (event) =>
      event.at >= dayAgo &&
      (event.kind === "fault" ||
        event.kind === "recovery_failed" ||
        (event.kind === "mission_result" &&
          (event.data as { status?: string } | null)?.status === "failed")),
  ).length;

  const freeze = () => {
    setFrozenEvents(snapshot.events);
    setFrozenAt(Date.now());
    setFrozen(true);
    toast.message("Log frozen", {
      description: "New events are still arriving. Follow live when ready.",
    });
  };

  const resume = () => {
    setFrozen(false);
    setFrozenAt(null);
    setFrozenEvents(null);
  };

  const clear = () => {
    setQuery("");
    setKind("all");
    setTurtleId("all");
  };

  const copy = async (event: EventRecord) => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          { id: event.id, at: new Date(event.at).toISOString(), turtleId: event.turtleId, kind: event.kind, data: event.data },
          null,
          2,
        ),
      );
      toast.success("Event copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="record / 05 · event log"
        title="Every hello, ore, and failure."
        description="The console keeps the last few thousand reports. Freeze the tail to read a fault without losing your place, or filter by turtle and kind."
        meta={
          <span>
            {frozen
              ? `frozen ${formatDateTime(frozenAt ?? now)} · ${source.length} events held`
              : `following live · ${snapshot.events.length} events in memory`}
          </span>
        }
        actions={
          frozen ? (
            <Button size="sm" onClick={resume}>
              <Play data-icon="inline-start" />
              Follow live
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={freeze}>
              <Pause data-icon="inline-start" />
              Freeze log
            </Button>
          )
        }
      />

      <StatBand
        items={[
          {
            label: "in memory",
            value: snapshot.events.length,
            unit: "events",
            hint: "ring capped at 5,000 on disk",
          },
          {
            label: "last hour",
            value: lastHour,
            hint: "across all turtles",
            tone: lastHour > 0 ? "signal" : "muted",
          },
          {
            label: "faults / 24h",
            value: faults,
            hint: "fault, recovery, failed mission",
            tone: faults ? "warning" : "live",
          },
          {
            label: "kinds",
            value: kinds.length,
            hint: "distinct report types",
          },
        ]}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/35 p-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="search kind, turtle, ore, payload"
              className="pl-8"
              aria-label="Search events"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger size="sm" className="w-[150px]">
                <SelectValue placeholder="kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all kinds</SelectItem>
                {kinds.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={turtleId} onValueChange={setTurtleId}>
              <SelectTrigger size="sm" className="w-[156px]">
                <SelectValue placeholder="turtle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all turtles</SelectItem>
                {(snapshot.turtles ?? []).map((turtle) => (
                  <SelectItem key={turtle.id} value={turtle.id}>
                    {turtleName(turtle)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {query || kind !== "all" || turtleId !== "all" ? (
              <Button variant="ghost" size="sm" onClick={clear}>
                <FilterX data-icon="inline-start" />
                Clear
              </Button>
            ) : null}
            <span className="mono ml-auto text-[9px] text-muted-foreground sm:ml-2">
              {filtered.length} shown
            </span>
          </div>
        </div>

        {frozen ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/25 bg-warning/[0.055] px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-warning">
              <StatusDot tone="warning" />
              Tail frozen at {formatClock(frozenAt ?? now)}. This view stays put while live events
              keep arriving.
            </div>
            <Button variant="outline" size="xs" onClick={resume}>
              Follow live
            </Button>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={snapshot.events.length === 0 ? "No events yet" : "No events match"}
            description={
              snapshot.events.length === 0
                ? "The first heartbeat will appear here. Register a turtle to start the record."
                : "Clear the filters or wait for the next report."
            }
            action={
              snapshot.events.length > 0 ? (
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card/25">
            {groups.map((group) => (
              <section key={group.label}>
                <div className="flex items-center justify-between border-b border-border/60 bg-card/50 px-3.5 py-2">
                  <span className="mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    {group.label}
                  </span>
                  <span className="mono text-[9px] text-muted-foreground/60">
                    {group.events.length} event{group.events.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {group.events.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      turtle={
                        turtleNames.get(event.turtleId ?? "") ??
                        (event.turtleId ?? "unknown").slice(0, 8)
                      }
                      now={now}
                      onCopy={() => void copy(event)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({
  event,
  turtle,
  now,
  onCopy,
}: {
  event: EventRecord;
  turtle: string;
  now: number;
  onCopy: () => void;
}) {
  const meta = eventMeta(event.kind, event.data);
  const payload = eventPayload(event);
  const hasPayload = payload.trim() !== "{}";

  return (
    <div className="group px-3.5 py-2.5 transition-colors hover:bg-accent/15">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex shrink-0 items-center gap-2 sm:w-[184px]">
          <span
            className="mono w-[58px] shrink-0 text-[10px] tabular-nums text-muted-foreground"
            title={formatDateTime(event.at)}
          >
            {formatClock(event.at)}
          </span>
          <StatusDot tone={meta.tone} />
          <span
            className={cn(
              "mono truncate rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.06em]",
              meta.tone === "danger"
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : meta.tone === "warning"
                  ? "border-warning/25 bg-warning/10 text-warning"
                  : meta.tone === "live"
                    ? "border-live/25 bg-live/10 text-live"
                    : meta.tone === "signal"
                      ? "border-signal/25 bg-signal/10 text-signal"
                      : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {meta.label}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="mono text-[10px] text-foreground/80">{turtle}</span>
            <span className="mono text-[9px] text-muted-foreground/60">
              {relativeTime(event.at, now)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-foreground/80">
            {eventSummary(event)}
          </div>

          {hasPayload ? (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className="mt-1 h-5 px-1.5 text-[9px] text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-90"
                >
                  <ChevronRight className="transition-transform" />
                  payload · {payload.length}b
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="relative mt-1.5 max-h-56 overflow-auto rounded-md border border-border/70 bg-background/55">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-1 top-1 text-muted-foreground"
                    onClick={onCopy}
                    aria-label="Copy event payload"
                  >
                    <Copy />
                  </Button>
                  <pre className="mono overflow-x-auto p-2.5 pr-9 text-[10px] leading-relaxed text-muted-foreground">
                    {payload}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      </div>
    </div>
  );
}
