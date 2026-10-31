import { HelpCircle, Package, Pickaxe, Shapes, Trees } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials, roleLabel, turtleName } from "@/lib/format";
import type { PublicTurtle, TurtleRole } from "@/lib/types";

const roleStyle: Record<TurtleRole, string> = {
  miner: "border-signal/30 bg-signal/12 text-signal",
  lumberjack: "border-live/30 bg-live/12 text-live",
  hauler: "border-info/30 bg-info/12 text-info",
  station_builder: "border-signal/30 bg-signal/12 text-signal",
  unassigned: "border-border bg-muted/50 text-muted-foreground",
};

const roleIcon = {
  miner: Pickaxe,
  lumberjack: Trees,
  hauler: Package,
  station_builder: Shapes,
  unassigned: HelpCircle,
} satisfies Record<TurtleRole, typeof Pickaxe>;

export function TurtleChip({
  turtle,
  size = "md",
  showRole = true,
  className,
}: {
  turtle: Pick<PublicTurtle, "label" | "computerId" | "id" | "role">;
  size?: "sm" | "md" | "lg";
  showRole?: boolean;
  className?: string;
}) {
  const name = turtleName(turtle);
  const role = turtle.role ?? "miner";
  const Icon = roleIcon[role];
  const box = size === "sm" ? "size-7 text-[10px]" : size === "lg" ? "size-11 text-sm" : "size-9 text-xs";

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      title={`${name} · ${roleLabel(role)}`}
    >
      <span
        className={cn(
          "display flex items-center justify-center rounded-md border font-semibold tracking-tight",
          box,
          roleStyle[role],
        )}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      {showRole ? (
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full border border-border bg-background">
          <Icon className="size-2.5 text-muted-foreground" aria-hidden="true" />
        </span>
      ) : null}
      <span className="sr-only">{name}</span>
    </span>
  );
}
