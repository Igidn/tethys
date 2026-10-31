import { ProductMark } from "@/components/common/product-mark";
import { StatusDot } from "@/components/common/status-dot";

export function BootScreen() {
  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden px-4 py-10">
      <div className="console-grid pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />
      <main className="reveal relative flex flex-col items-center text-center">
        <ProductMark className="size-12 text-signal" />
        <div className="mono mt-5 text-[10px] uppercase tracking-[0.24em] text-signal">
          tethys · control plane
        </div>
        <h1 className="display mt-2 text-2xl font-semibold">Opening the control plane</h1>
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Checking the operator key, then asking the Tethys server for a state snapshot.
        </p>
        <div className="mt-6 flex items-center gap-2">
          <StatusDot tone="warning" pulse />
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            connecting
          </span>
        </div>
      </main>
    </div>
  );
}
