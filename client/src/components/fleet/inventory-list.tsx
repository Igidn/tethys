import { Box } from "lucide-react";
import { itemTone, prettyItem } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";

export function InventoryList({ inventory = [] }: { inventory?: InventoryItem[] }) {
  const items = [...inventory]
    .filter((item) => item.count > 0)
    .sort((a, b) => a.slot - b.slot);

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-4">
        <Box className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-[11px] text-muted-foreground">Hold is empty.</span>
      </div>
    );
  }

  return (
    <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={`${item.slot}-${item.name}`}
          className="flex min-w-0 items-center gap-2 border-b border-border/40 pb-1.5"
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: itemTone(item.name) }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/85">
            {prettyItem(item.name)}
          </span>
          <span className="mono shrink-0 text-[10px] tabular-nums text-muted-foreground">
            ×{item.count}
          </span>
          <span className="mono w-5 shrink-0 text-right text-[9px] tabular-nums text-muted-foreground/50">
            {item.slot}
          </span>
        </div>
      ))}
    </div>
  );
}
