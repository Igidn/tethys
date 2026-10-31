import { Check, Copy, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useConsole } from "@/lib/use-console";
import { Button } from "@/components/ui/button";
import { ProductMark } from "@/components/common/product-mark";

export function FirstRun() {
  const { snapshot } = useConsole();
  const [copied, setCopied] = useState(false);
  if (!snapshot) return null;

  const command = `wget https://github.com/${snapshot.config.githubRepo}/releases/download/${snapshot.config.releaseTag}/install.lua install.lua\ninstall`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success("Install command copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  return (
    <section className="reveal relative overflow-hidden rounded-xl border border-border/80 bg-card/45">
      <div className="console-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(620px_320px_at_18%_0%,oklch(0.79_0.145_78/0.1),transparent_72%)]"
        aria-hidden="true"
      />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-10">
        <div>
          <div className="flex items-center gap-3">
            <ProductMark className="size-9 text-signal" />
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-signal">
              first run
            </div>
          </div>
          <h2 className="display mt-5 text-2xl font-semibold leading-tight sm:text-3xl">
            The wire is quiet.
          </h2>
          <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-muted-foreground">
            No turtle has registered with this console. Install the runtime on a CC: Tweaked
            turtle and it will claim the next station, start its first branch-mine mission, and
            appear here.
          </p>

          <div className="mt-6 overflow-hidden rounded-lg border border-border/80 bg-background/55">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <span className="flex items-center gap-2 mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <TerminalSquare className="size-3" aria-hidden="true" />
                turtle shell
              </span>
              <Button variant="ghost" size="xs" onClick={() => void copy()}>
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                {copied ? "copied" : "copy"}
              </Button>
            </div>
            <pre className="mono overflow-x-auto px-3.5 py-3 text-[11px] leading-relaxed text-foreground/85">
              <span className="text-muted-foreground">$ </span>
              {command.split("\n")[0]}
              {"\n"}
              <span className="text-muted-foreground">$ </span>
              {command.split("\n")[1]}
            </pre>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["01", "Register", "The installer stores an id and secret on the turtle."],
              ["02", "Claim a station", "The console assigns the lowest free sector."],
              ["03", "Mine", "The first mission starts automatically on hello."],
            ].map(([index, title, detail]) => (
              <div key={index} className="border-t border-border/70 pt-3">
                <div className="mono text-[9px] text-signal">{index}</div>
                <div className="mt-1 text-[12px] font-medium">{title}</div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <DockDiagram />
        </div>
      </div>
    </section>
  );
}

function DockDiagram() {
  return (
    <svg
      viewBox="0 0 320 300"
      className="h-auto w-full max-w-[340px]"
      role="img"
      aria-label="Dock fixture: output chest below, turtle in the centre, fuel chest above, shaft to the north"
    >
      <defs>
        <pattern id="dock-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" stroke="var(--border)" strokeOpacity="0.45" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="24" y="18" width="272" height="264" fill="url(#dock-grid)" rx="6" />
      <text x="34" y="36" className="mono" fill="var(--muted-foreground)" fontSize="8" opacity="0.7">
        DOCK / STATION FRAME
      </text>

      <rect x="130" y="78" width="60" height="28" rx="3" fill="oklch(0.29 0.03 85)" stroke="var(--warning)" strokeOpacity="0.5" />
      <text x="160" y="96" textAnchor="middle" className="mono" fill="var(--warning)" fontSize="8">
        FUEL
      </text>

      <rect x="128" y="124" width="64" height="52" rx="4" fill="oklch(0.25 0.03 120)" stroke="var(--signal)" strokeOpacity="0.6" />
      <rect x="140" y="136" width="40" height="18" rx="2" fill="none" stroke="var(--signal)" strokeOpacity="0.8" />
      <circle cx="160" cy="145" r="2" fill="var(--signal)" />
      <text x="160" y="168" textAnchor="middle" className="mono" fill="var(--signal)" fontSize="8">
        TURTLE
      </text>

      <rect x="130" y="194" width="60" height="28" rx="3" fill="oklch(0.24 0.02 100)" stroke="var(--muted-foreground)" strokeOpacity="0.45" />
      <text x="160" y="212" textAnchor="middle" className="mono" fill="var(--muted-foreground)" fontSize="8">
        OUTPUT
      </text>

      <line x1="160" y1="124" x2="160" y2="106" stroke="var(--warning)" strokeOpacity="0.4" strokeDasharray="2 3" />
      <line x1="160" y1="176" x2="160" y2="194" stroke="var(--muted-foreground)" strokeOpacity="0.4" strokeDasharray="2 3" />

      <line x1="160" y1="78" x2="160" y2="42" stroke="var(--signal)" strokeOpacity="0.6" strokeWidth="1.5" />
      <path d="M154 48 160 38 166 48" fill="none" stroke="var(--signal)" strokeWidth="1.5" />
      <text x="172" y="50" className="mono" fill="var(--signal)" fontSize="8">
        SHAFT
      </text>

      <line x1="128" y1="150" x2="94" y2="150" stroke="var(--border)" />
      <text x="90" y="153" textAnchor="end" className="mono" fill="var(--muted-foreground)" fontSize="7">
        WALL
      </text>
      <line x1="192" y1="150" x2="226" y2="150" stroke="var(--border)" />
      <text x="230" y="153" className="mono" fill="var(--muted-foreground)" fontSize="7">
        WALL
      </text>
      <line x1="160" y1="222" x2="160" y2="246" stroke="var(--border)" />
      <text x="160" y="260" textAnchor="middle" className="mono" fill="var(--muted-foreground)" fontSize="7">
        REAR WALL / SOUTH
      </text>

      <circle cx="160" cy="145" r="30" fill="none" stroke="var(--signal)" strokeOpacity="0.15" strokeDasharray="2 5" />
    </svg>
  );
}
