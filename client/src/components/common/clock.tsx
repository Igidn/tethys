import { formatClock } from "@/lib/format";
import { useNow } from "@/lib/use-console";
import { cn } from "@/lib/utils";

export function Clock({ className }: { className?: string }) {
  const now = useNow(1000);
  return (
    <div className={cn("mono text-[11px] tabular-nums text-muted-foreground", className)}>
      <span className="text-foreground/85">{formatClock(now)}</span>
      <span className="ml-2 hidden sm:inline">
        {new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
        }).format(now)}
      </span>
    </div>
  );
}
