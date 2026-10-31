import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneText, type Tone } from "@/lib/format";

export function Readout({
  label,
  value,
  unit,
  hint,
  tone = "muted",
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: Tone;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mono mt-1 flex items-baseline gap-1 text-[15px] leading-tight tabular-nums",
          toneText[tone],
          valueClassName,
        )}
      >
        <span className="truncate">{value}</span>
        {unit ? <span className="text-[10px] text-muted-foreground">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
