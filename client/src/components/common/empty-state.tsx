import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "console-grid relative overflow-hidden rounded-xl border border-dashed border-border/90 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="relative mx-auto flex max-w-md flex-col items-center">
        <span className="grid size-10 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h3 className="display mt-4 text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
