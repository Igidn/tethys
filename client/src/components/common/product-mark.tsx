import { cn } from "@/lib/utils";

export function ProductMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      <path d="M20 3.5 36 12.2 20 20.9 4 12.2Z" fill="currentColor" opacity="0.18" />
      <path d="M20 12.6 36 21.3 20 30 4 21.3Z" fill="currentColor" opacity="0.42" />
      <path d="M20 21.7 36 30.4 20 39.1 4 30.4Z" fill="currentColor" />
      <path d="M20 12.6 28 17 20 21.4 12 17Z" fill="var(--background)" opacity="0.55" />
    </svg>
  );
}
