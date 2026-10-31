import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { useConsole, useNow } from "@/lib/use-console";
import { StatusDot } from "./status-dot";

export function ConnectionBadge({ className }: { className?: string }) {
  const { status, lastSync } = useConsole();
  const now = useNow(5000);

  const copy = {
    live: { label: "live", tone: "live" as const, pulse: true },
    offline: { label: "reconnecting", tone: "warning" as const, pulse: true },
    unauthorized: { label: "locked", tone: "warning" as const, pulse: false },
    booting: { label: "connecting", tone: "muted" as const, pulse: true },
  }[status];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <StatusDot tone={copy.tone} pulse={copy.pulse} />
      <span className="mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {copy.label}
        {status === "live" && lastSync ? (
          <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/70">
            {relativeTime(lastSync, now)}
          </span>
        ) : null}
      </span>
    </div>
  );
}
