import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("reveal", className)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-signal" aria-hidden="true" />
            <span className="mono text-[10px] font-medium uppercase tracking-[0.22em] text-signal">
              {eyebrow}
            </span>
          </div>
          <h1 className="display mt-2.5 text-[clamp(1.75rem,3.2vw,2.65rem)] font-semibold leading-[1.05] text-foreground">
            {title}
          </h1>
          <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
        <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          cc-util · field console
        </div>
        {meta ? <div className="mono text-[10px] text-muted-foreground">{meta}</div> : null}
      </div>
    </header>
  );
}

export function SectionHead({
  title,
  description,
  action,
  className,
  kicker,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  kicker?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        {kicker ? (
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {kicker}
          </div>
        ) : null}
        <h2 className="display mt-1 text-lg font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
