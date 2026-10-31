import { cn } from "@/lib/utils";
import { toneBg, type Tone } from "@/lib/format";

export function StatusDot({
  tone = "muted",
  pulse = false,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-1.5 shrink-0 rounded-full",
        toneBg[tone],
        pulse && "pulse-live",
        className,
      )}
    />
  );
}
