import { RefreshCw, ServerOff } from "lucide-react";
import { useState } from "react";
import { useConsole } from "@/lib/use-console";
import { Button } from "@/components/ui/button";
import { ProductMark } from "@/components/common/product-mark";
import { StatusDot } from "@/components/common/status-dot";

export function OfflineScreen() {
  const { refresh, status } = useConsole();
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    await refresh();
    window.setTimeout(() => setBusy(false), 600);
  };

  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden px-4 py-10">
      <div className="console-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
      <main className="reveal relative w-full max-w-lg rounded-xl border border-border/90 bg-card/70 p-7">
        <div className="flex items-center gap-3">
          <ProductMark className="size-9 text-muted-foreground" />
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            tethys · control plane
          </div>
        </div>

        <div className="mt-7 flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
            <ServerOff className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h1 className="display text-xl font-semibold">Console API is offline</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              The browser cannot reach <span className="mono text-foreground/80">/api/state</span>.
              Start the Tethys server, then retry.
            </p>
          </div>
        </div>

        <pre className="mono mt-5 overflow-x-auto rounded-lg border border-border/80 bg-background/60 px-4 py-3 text-[11px] text-muted-foreground">
          <span className="text-signal">cd</span> client{"\n"}
          <span className="text-signal">npm</span> run dev
        </pre>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={retry} disabled={busy}>
            <RefreshCw data-icon="inline-start" className={busy ? "animate-spin" : ""} />
            Retry connection
          </Button>
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <StatusDot tone={status === "offline" ? "danger" : "muted"} pulse />
            socket reconnecting in the background
          </span>
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
          In production the same Node process serves the built frontend. Run{" "}
          <span className="mono text-foreground/80">npm run build</span> once, then serve the built
          <span className="mono text-foreground/80">client/dist/</span> from the Tethys server.
        </p>
      </main>
    </div>
  );
}
