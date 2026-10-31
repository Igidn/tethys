import { cn } from "@/lib/utils";
import { fuelTone, type Tone } from "@/lib/format";

const fill: Record<Tone, string> = {
  live: "bg-live",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  signal: "bg-signal",
  muted: "bg-muted-foreground",
};

export function FuelBar({
  fuel,
  reserve,
  segments = 12,
  showValue = true,
  className,
}: {
  fuel: number | "unlimited" | undefined;
  reserve: number;
  segments?: number;
  showValue?: boolean;
  className?: string;
}) {
  const unlimited = fuel === "unlimited";
  const value = typeof fuel === "number" ? fuel : 0;
  const ratio = unlimited ? 1 : Math.min(1, value / Math.max(1, reserve * 4));
  const filled = unlimited ? segments : Math.round(ratio * segments);
  const tone = fuelTone(fuel, reserve);

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="flex flex-1 gap-0.5"
        role="img"
        aria-label={unlimited ? "fuel unlimited" : `fuel ${value}, reserve ${reserve}`}
      >
        {Array.from({ length: segments }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-[1px] transition-colors duration-500",
              index < filled ? fill[tone] : "bg-muted",
            )}
          />
        ))}
      </div>
      {showValue ? (
        <span className="mono shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {unlimited ? "∞" : value.toLocaleString()}
        </span>
      ) : null}
    </div>
  );
}
