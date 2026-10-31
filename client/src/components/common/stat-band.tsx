import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Readout } from "./readout";
import type { Tone } from "@/lib/format";

export type Stat = {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: Tone;
};

export function StatBand({
  items,
  className,
  columns = 4,
}: {
  items: Stat[];
  className?: string;
  columns?: 2 | 3 | 4;
}) {
  const grid =
    columns === 4
      ? "grid-cols-2 lg:grid-cols-4"
      : columns === 3
        ? "grid-cols-2 lg:grid-cols-3"
        : "grid-cols-2";

  return (
    <div
      className={cn(
        "hairline grid overflow-hidden rounded-xl border border-border/80 bg-card/35",
        grid,
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "px-4 py-3.5",
            index < items.length - 1 && "border-b border-border/60",
            "lg:border-b-0 lg:border-r lg:last:border-r-0",
            columns === 2 && "even:border-r-0",
          )}
        >
          <Readout {...item} />
        </div>
      ))}
    </div>
  );
}
