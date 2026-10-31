import { LockKeyhole, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConsole } from "@/lib/use-console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductMark } from "@/components/common/product-mark";
import { StatusDot } from "@/components/common/status-dot";

export function LockScreen() {
  const { setToken, status } = useConsole();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      setError("Enter the admin token from console/.env.");
      return;
    }
    setError("");
    setSubmitting(true);
    setToken(value.trim());
    window.setTimeout(() => setSubmitting(false), 1200);
  };

  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden px-4 py-10">
      <div className="console-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_320px_at_50%_18%,oklch(0.79_0.145_78/0.09),transparent_70%)]"
        aria-hidden="true"
      />
      <main className="reveal relative w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <ProductMark className="size-10 text-signal" />
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.22em] text-signal">
              tethys
            </div>
            <div className="display text-lg font-semibold leading-tight">Control plane</div>
          </div>
        </div>

        <div className="hairline rounded-xl border border-border/90 bg-card/75 p-6 shadow-[0_24px_80px_-40px_oklch(0_0_0/0.9)]">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4 text-signal" aria-hidden="true" />
            <h1 className="display text-xl font-semibold">Operator key required</h1>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This console is behind the admin token. The token stays in this browser and is sent
            to the local console API only.
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-token" className="mono text-[10px] uppercase tracking-[0.16em]">
                admin token
              </Label>
              <Input
                id="admin-token"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="from console/.env"
                aria-invalid={Boolean(error)}
                className="h-10"
              />
            </div>

            {error ? (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            {status === "booting" ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <StatusDot tone="warning" pulse />
                checking key against the console
              </div>
            ) : null}

            <Button type="submit" size="lg" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Opening console" : "Open console"}
            </Button>
          </form>
        </div>

        <p className="mono mt-5 text-center text-[10px] leading-relaxed text-muted-foreground">
          Set ADMIN_TOKEN in console/.env. Leave it empty only for a private pilot.
        </p>
      </main>
    </div>
  );
}
