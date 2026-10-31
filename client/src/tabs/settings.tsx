import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  Globe2,
  KeyRound,
  LockKeyhole,
  Ruler,
  ShieldCheck,
  ShieldAlert,
  TerminalSquare,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hostFromUrl } from "@/lib/format";
import { useConsole } from "@/lib/use-console";
import { PageHeader, SectionHead } from "@/components/common/page-header";
import { StatBand } from "@/components/common/stat-band";
import { Readout } from "@/components/common/readout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SettingsTab() {
  const { snapshot, token, setToken, exportUrl } = useConsole();
  const [copied, setCopied] = useState<string | null>(null);
  if (!snapshot) return null;

  const { config } = snapshot;
  const sector = config.sectorHalf * 2;
  const depth = Math.abs(config.topWorldY - config.bottomWorldY);
  const layers = Math.floor(depth / config.layerStep) + 1;
  const install = `wget https://github.com/${config.githubRepo}/releases/download/${config.releaseTag}/install.lua install.lua\ninstall`;
  const tunnelHost = hostFromUrl(snapshot.tunnelUrl);

  const copy = async (value: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="record / 06 · settings"
        title="Runtime geometry and access."
        description="Read-only view of the console configuration. Change these in console/.env, then restart the Node process. The frontend is served from the same origin."
        meta={<span>protocol 1 · state schema 1 · field console v0.2</span>}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copy(install, "install", "Install command")}
            >
              {copied === "install" ? (
                <Check data-icon="inline-start" />
              ) : (
                <TerminalSquare data-icon="inline-start" />
              )}
              Copy install
            </Button>
            <Button asChild size="sm">
              <a href={exportUrl()} download>
                <Download data-icon="inline-start" />
                Export state
              </a>
            </Button>
          </>
        }
      />

      {!config.adminRequired ? (
        <Alert className="border-warning/35 bg-warning/[0.065] text-foreground">
          <TriangleAlert className="text-warning" />
          <AlertTitle className="text-[13px]">Console access is open</AlertTitle>
          <AlertDescription className="text-[11px] leading-relaxed">
            No admin token is configured. Anyone who can reach the tunnel can start, recall, or
            abort missions. Set <span className="mono text-warning">ADMIN_TOKEN</span> in{" "}
            <span className="mono text-warning">console/.env</span>, restart, and reload this page.
          </AlertDescription>
        </Alert>
      ) : null}

      <StatBand
        items={[
          {
            label: "sector",
            value: `${sector} × ${sector}`,
            unit: "blocks",
            hint: `max radius ${config.maxRadius}`,
          },
          {
            label: "depth",
            value: depth,
            unit: "blocks",
            hint: `Y ${config.topWorldY} → ${config.bottomWorldY}`,
          },
          {
            label: "layers",
            value: layers,
            unit: `× ${config.layerStep}`,
            hint: `${config.branchSpacing} block branch spacing`,
          },
          {
            label: "fuel reserve",
            value: config.reserve,
            unit: "fuel",
            hint: `${config.maxTripBlocks} block trip cap`,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="flex flex-col gap-4">
          <Panel
            icon={Ruler}
            kicker="mine"
            title="Geometry"
            description="Deterministic branch-mine layout. The plan is rebuilt from these values, not stored as a block list."
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Readout label="sector half" value={config.sectorHalf} unit="blocks" />
              <Readout label="top world y" value={config.topWorldY} />
              <Readout label="bottom world y" value={config.bottomWorldY} />
              <Readout label="layer step" value={config.layerStep} unit="blocks" />
              <Readout label="branch spacing" value={config.branchSpacing} unit="blocks" />
              <Readout label="max radius" value={config.maxRadius} unit="blocks" />
              <Readout label="base x / z" value={`${config.baseX} / ${config.baseZ}`} />
              <Readout label="station spacing" value={config.stationSpacing} unit="blocks" />
            </div>
            <p className="mt-4 border-t border-border/60 pt-3 text-[10px] leading-relaxed text-muted-foreground">
              A station anchor shifts by <span className="mono">{config.stationSpacing}</span>{" "}
              blocks on each new registration. The turtle starts from its own dock and never
              shares a shaft.
            </p>
          </Panel>

          <Panel
            icon={ShieldAlert}
            kicker="safety"
            title="Trip and safety caps"
            description="The Lua runtime checks these limits before it commits to another branch."
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Readout label="reserve fuel" value={config.reserve} hint="return threshold" tone="warning" />
              <Readout label="max trip" value={config.maxTripBlocks} unit="blocks" />
              <Readout label="max vein" value={config.maxVeinBlocks} unit="blocks" />
              <Readout label="max depth" value={config.maxDepth} unit="blocks" />
              <Readout
                label="heartbeat"
                value={Math.round(config.heartbeatMs / 1000)}
                unit="s"
                hint="hello interval"
              />
              <Readout
                label="stale after"
                value={Math.round(config.staleMs / 1000)}
                unit="s"
                hint="offline threshold"
              />
            </div>
            <p className="mt-4 border-t border-border/60 pt-3 text-[10px] leading-relaxed text-muted-foreground">
              Vein caps are counted in plan blocks, not item stacks. A turtle returns when either
              cap is reached, then re-enters the same mission on the next start.
            </p>
          </Panel>

          <Panel
            icon={Globe2}
            kicker="transport"
            title="Tunnel and publication"
            description="The console uses the same public host for REST, turtle WebSocket, and Socket.IO."
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Readout label="listen port" value={config.port} />
              <Readout label="tunnel host" value={tunnelHost} hint={snapshot.tunnelUrl || "unresolved"} />
              <Readout
                label="publish"
                value={config.publish ? "enabled" : "off"}
                tone={config.publish ? "live" : "muted"}
                hint={config.publish ? "release assets on start" : "local manifest only"}
              />
              <Readout label="repo" value={config.githubRepo} />
              <Readout label="release tag" value={config.releaseTag} />
              <Readout label="frontend" value="web/dist" hint="served in production" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <span className="mono min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                {snapshot.tunnelUrl || "no tunnel URL resolved"}
              </span>
              <Button
                variant="outline"
                size="xs"
                disabled={!snapshot.tunnelUrl}
                onClick={() => void copy(snapshot.tunnelUrl, "tunnel", "Tunnel URL")}
              >
                {copied === "tunnel" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                copy
              </Button>
              {snapshot.tunnelUrl ? (
                <Button asChild variant="ghost" size="xs">
                  <a href={snapshot.tunnelUrl} target="_blank" rel="noreferrer">
                    open
                    <ExternalLink data-icon="inline-end" />
                  </a>
                </Button>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel
            icon={KeyRound}
            kicker="access"
            title="Operator key"
            description="The token authorizes the console REST API and the realtime socket."
          >
            {config.adminRequired ? (
              <div className="flex items-start gap-3 rounded-lg border border-live/25 bg-live/[0.055] px-3.5 py-3">
                <ShieldCheck className="mt-0.5 size-4 text-live" aria-hidden="true" />
                <div>
                  <div className="text-[12px] font-medium text-foreground">Admin token enforced</div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    REST and Socket.IO both reject requests without the token.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/[0.055] px-3.5 py-3">
                <TriangleAlert className="mt-0.5 size-4 text-warning" aria-hidden="true" />
                <div>
                  <div className="text-[12px] font-medium text-foreground">No token configured</div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    Only safe on a trusted private network. Do not expose the tunnel.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
              <div>
                <div className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  local key
                </div>
                <div className="mono mt-0.5 text-[11px]">
                  {token ? `${token.slice(0, 4)}${"•".repeat(Math.min(16, Math.max(4, token.length - 4)))}` : "not held"}
                </div>
              </div>
              {config.adminRequired ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!token}
                  onClick={() => setToken("")}
                >
                  <LockKeyhole data-icon="inline-start" />
                  Lock console
                </Button>
              ) : null}
            </div>
          </Panel>

          <Panel
            icon={TerminalSquare}
            kicker="turtle"
            title="Install command"
            description="Run this in the turtle shell after connecting to the server. The installer fetches the Lua runtime and registers the unit."
          >
            <div className="overflow-hidden rounded-lg border border-border/80 bg-background/55">
              <div className="flex items-center justify-between border-b border-border/70 px-2.5 py-1.5">
                <span className="mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  turtle shell
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void copy(install, "install-2", "Install command")}
                >
                  {copied === "install-2" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                  {copied === "install-2" ? "copied" : "copy"}
                </Button>
              </div>
              <pre className="mono overflow-x-auto px-3 py-2.5 text-[10px] leading-relaxed text-foreground/85">
                <span className="text-muted-foreground">$ </span>
                {install.split("\n")[0]}
                {"\n"}
                <span className="text-muted-foreground">$ </span>
                {install.split("\n")[1]}
              </pre>
              <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    window.location.hash = "deployment";
                  }}
                >
                  <UserPlus data-icon="inline-start" />
                  Assign turtle roles
                </Button>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
              The turtle needs a wireless or wired modem and a path to the console host. The
              installer stores its id and secret locally and never sends the secret again.
            </p>
          </Panel>

          <Panel
            icon={Database}
            kicker="data"
            title="State export"
            description="A JSON snapshot of turtles, stations, missions, events, and the sparse ore maps."
          >
            <div className="flex flex-col gap-2.5">
              <Button asChild variant="outline" className="w-full justify-between">
                <a href={exportUrl()} download>
                  <span className="flex items-center gap-2">
                    <Download className="size-3.5" />
                    Export state.json
                  </span>
                  <ArrowUpRight className="size-3.5 text-muted-foreground" />
                </a>
              </Button>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Contains turtle secret hashes and the full event ring. Keep the file private.
                Restoring state is a manual file copy to{" "}
                <span className="mono text-foreground/75">console/data/state.json</span>.
              </p>
            </div>
          </Panel>

          <div className="rounded-xl border border-border/70 bg-card/25 p-4">
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              about
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Readout label="rest" value="HTTP / JSON" hint="token bearer or query" />
              <Readout label="realtime" value="Socket.IO" hint="state snapshot on change" />
              <Readout label="turtles" value="CC: Tweaked" hint="websocket /ws" />
              <Readout label="build" value="v0.2" hint="field console" />
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
              <span className="mono flex items-center gap-1.5 text-[9px] text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", config.adminRequired ? "bg-live" : "bg-warning")} />
                {config.adminRequired ? "secured" : "open"}
              </span>
              <span className="mono ml-auto text-[9px] text-muted-foreground/60">
                {config.githubRepo}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({
  icon: Icon,
  kicker,
  title,
  description,
  children,
}: {
  icon: typeof Ruler;
  kicker: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/80 bg-card/35 p-4 sm:p-5">
      <SectionHead
        kicker={kicker}
        title={title}
        description={description}
        action={
          <span className="grid size-8 place-items-center rounded-md border border-border bg-background/50 text-muted-foreground">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        }
      />
      <div className="mt-4">{children}</div>
    </section>
  );
}
