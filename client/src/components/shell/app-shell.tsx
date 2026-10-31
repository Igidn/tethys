import { useMemo } from "react";
import { toast } from "sonner";
import {
  Copy,
  Globe2,
  LockKeyhole,
  MoreHorizontal,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hostFromUrl, relativeTime } from "@/lib/format";
import { useConsole, useNow } from "@/lib/use-console";
import { buildIssues, issueCount } from "@/lib/attention";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductMark } from "@/components/common/product-mark";
import { StatusDot } from "@/components/common/status-dot";
import { ConnectionBadge } from "@/components/common/connection-badge";
import { Clock } from "@/components/common/clock";
import { TABS, type TabId } from "./tabs";

function NavBadge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "signal" | "muted" }) {
  return (
    <span
      className={cn(
        "mono rounded px-1.5 py-0.5 text-[9px] leading-none tabular-nums",
        tone === "signal" ? "bg-signal/15 text-signal" : "bg-background/60 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function RailNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  const { snapshot } = useConsole();
  const now = useNow(10_000);
  const issues = useMemo(
    () => (snapshot ? buildIssues(snapshot, now) : []),
    [snapshot, now],
  );
  const alerts = issueCount(issues);

  const groups: { id: "operations" | "fleet" | "record"; label: string }[] = [
    { id: "operations", label: "operations" },
    { id: "fleet", label: "fleet" },
    { id: "record", label: "record" },
  ];

  return (
    <nav className="flex flex-col gap-6" aria-label="Console sections">
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <div className="mono px-3 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
            {group.label}
          </div>
          {TABS.filter((tab) => tab.group === group.id).map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            const count =
              tab.id === "overview"
                ? alerts
                : tab.id === "mining"
                  ? snapshot?.counts.activeMissions
                  : tab.id === "fleet"
                    ? snapshot?.counts.turtles
                    : undefined;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(tab.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/45 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    isActive ? "text-signal" : "text-muted-foreground/70 group-hover:text-foreground",
                  )}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{tab.label}</span>
                {tab.preview ? (
                  <span className="mono rounded border border-border/70 px-1 py-0.5 text-[8px] uppercase tracking-[0.1em] text-muted-foreground">
                    preview
                  </span>
                ) : count ? (
                  <NavBadge tone={tab.id === "overview" ? "signal" : "muted"}>{count}</NavBadge>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function MobileNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  const { snapshot } = useConsole();
  return (
    <div className="border-b border-border/70 bg-sidebar/70 px-3 pb-2">
      <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          const count =
            tab.id === "mining"
              ? snapshot?.counts.activeMissions
              : tab.id === "fleet"
                ? snapshot?.counts.turtles
                : undefined;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors",
                isActive
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-3.5", isActive && "text-signal")} aria-hidden="true" />
              <span>{tab.short}</span>
              {count ? <span className="mono text-[9px] text-muted-foreground">{count}</span> : null}
              {tab.preview ? <span className="size-1 rounded-full bg-signal" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RailFooter() {
  const { snapshot, token, setToken } = useConsole();
  const now = useNow(10_000);
  const tunnel = snapshot?.tunnelUrl ?? "";
  const host = hostFromUrl(tunnel);
  const adminRequired = snapshot?.config.adminRequired ?? false;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  return (
    <div className="mt-auto flex flex-col gap-3 border-t border-sidebar-border px-3 pt-4">
      <div className="flex items-center justify-between">
        <ConnectionBadge />
        <Clock className="hidden xl:block" />
      </div>

      <button
        type="button"
        onClick={() => copy(tunnel, "Tunnel URL")}
        className="group flex items-center gap-2 rounded-md px-1 py-1 text-left text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        title={tunnel || "No tunnel resolved"}
      >
        <Globe2 className="size-3 shrink-0" aria-hidden="true" />
        <span className="mono truncate">{host}</span>
        <Copy className="ml-auto size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </button>

      <div className="flex items-center justify-between pb-3">
        <span className="mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
          v0.2 · {snapshot ? relativeTime(snapshot.serverTime, now) : "offline"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Console menu"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="mono text-[9px] uppercase tracking-[0.14em]">
                operator
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  window.location.hash = "settings";
                }}
              >
                <Settings2 />
                Runtime settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => copy(tunnel, "Tunnel URL")}>
                <Copy />
                Copy tunnel URL
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {adminRequired ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setToken("")}>
                    <LockKeyhole />
                    Lock console
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-muted-foreground">
              {adminRequired ? (
                <>
                  <ShieldCheck className="size-3 text-live" aria-hidden="true" />
                  token held
                </>
              ) : (
                <>
                  <StatusDot tone="warning" />
                  open access
                </>
              )}
              {token ? <span className="mono ml-auto">{token.slice(0, 4)}···</span> : null}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function AppShell({
  active,
  onChange,
  children,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  children: React.ReactNode;
}) {
  const { snapshot } = useConsole();
  const tab = TABS.find((entry) => entry.id === active) ?? TABS[0];

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-sidebar-border bg-sidebar/80 px-3 pt-5 backdrop-blur-[2px] lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <ProductMark className="size-9 text-signal" />
          <div className="min-w-0">
            <div className="mono text-[9px] uppercase tracking-[0.22em] text-signal">tethys</div>
            <div className="display truncate text-[15px] font-semibold leading-tight">
              Control plane
            </div>
          </div>
        </div>
        <RailNav active={active} onChange={onChange} />
        <RailFooter />
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-40 border-b border-border/70 bg-sidebar/85 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <ProductMark className="size-7 text-signal" />
              <div>
                <div className="mono text-[8px] uppercase tracking-[0.2em] text-signal">tethys</div>
                <div className="display text-sm font-semibold leading-none">Control plane</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ConnectionBadge />
            </div>
          </div>
          <MobileNav active={active} onChange={onChange} />
        </div>

        <main className="mx-auto w-full max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-5 hidden items-center justify-between lg:flex">
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              operations / {tab.label.toLowerCase()}
            </div>
            <div className="flex items-center gap-5">
              <span className="mono text-[10px] text-muted-foreground/70">
                {snapshot ? `${snapshot.counts.online}/${snapshot.counts.turtles} online` : "no telemetry"}
              </span>
              <Clock />
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
