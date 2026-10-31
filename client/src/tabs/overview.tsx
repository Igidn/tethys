import { ArrowRight, RefreshCw } from "lucide-react";
import { useConsole, useNow } from "@/lib/use-console";
import { buildIssues, issueCount } from "@/lib/attention";
import { relativeTime } from "@/lib/format";
import { PageHeader, SectionHead } from "@/components/common/page-header";
import { StatBand } from "@/components/common/stat-band";
import { ConnectionBadge } from "@/components/common/connection-badge";
import { Button } from "@/components/ui/button";
import { AttentionPanel, FleetReadiness } from "@/components/dashboard/attention-panel";
import { DepthField } from "@/components/dashboard/depth-field";
import { ProductionPanel, ActivityFeed } from "@/components/dashboard/production-panel";
import { FirstRun } from "@/components/dashboard/first-run";

export function OverviewTab() {
  const { snapshot, refresh, lastSync } = useConsole();
  const now = useNow(10_000);
  if (!snapshot) return null;

  const issues = buildIssues(snapshot, now);
  const alerts = issueCount(issues);
  const fuelRisk = snapshot.turtles.filter(
    (turtle) =>
      typeof turtle.fuel === "number" && turtle.fuel <= snapshot.config.reserve,
  ).length;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="operations / 01 · command deck"
        title="Everything the fleet is doing, in one glance."
        description="The deck leads with what needs a human: stranded turtles, low fuel, paused work. Readiness, the live mine cross-section, and production follow."
        meta={
          <div className="flex flex-wrap items-center gap-4">
            <ConnectionBadge />
            <span>snapshot {relativeTime(lastSync, now)}</span>
            <span>{alerts} open decision{alerts === 1 ? "" : "s"}</span>
          </div>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw data-icon="inline-start" />
              Sync
            </Button>
            <Button
              size="sm"
              onClick={() => {
                window.location.hash = "mining";
              }}
            >
              Open mining
              <ArrowRight data-icon="inline-end" />
            </Button>
          </>
        }
      />

      {snapshot.turtles.length === 0 ? <FirstRun /> : null}

      <div className="reveal reveal-1">
        <StatBand
          items={[
            {
              label: "fleet online",
              value: `${snapshot.counts.online}/${snapshot.counts.turtles}`,
              hint: `${snapshot.counts.miners} miners · ${snapshot.counts.lumberjacks} lumberjacks`,
              tone: snapshot.counts.online === snapshot.counts.turtles ? "live" : "warning",
            },
            {
              label: "active missions",
              value: snapshot.counts.activeMissions,
              unit: "running",
              hint: `${snapshot.counts.pausedMissions} paused`,
              tone: snapshot.counts.activeMissions > 0 ? "signal" : "muted",
            },
            {
              label: "ore cells logged",
              value: snapshot.counts.ores.toLocaleString(),
              hint: `${snapshot.ores.length} ore types`,
              tone: snapshot.counts.ores > 0 ? "signal" : "muted",
            },
            {
              label: "fuel risk",
              value: fuelRisk,
              unit: fuelRisk === 1 ? "turtle" : "turtles",
              hint: `reserve threshold ${snapshot.config.reserve}`,
              tone: fuelRisk > 0 ? "warning" : "live",
            },
          ]}
        />
      </div>

      {snapshot.turtles.length > 0 ? (
        <div className="reveal reveal-2 grid gap-4 xl:grid-cols-[1.16fr_0.84fr]">
          <AttentionPanel issues={issues} />
          <FleetReadiness issues={issues} />
        </div>
      ) : null}

      <section className="reveal reveal-3 rounded-xl border border-border/80 bg-card/30 p-4 sm:p-5">
        <SectionHead
          kicker="underground"
          title="Live cross-section"
          description="Station shafts, turtle depth, and recent ore cells. Yo-yo between the dock and the frontier is the dominant cost, so depth is the honest progress bar."
          action={
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-signal" /> miner
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-live" /> lumberjack
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-info" /> hauler
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-ore-diamond" /> ore
              </span>
            </div>
          }
        />
        <div className="mt-4">
          <DepthField snapshot={snapshot} />
        </div>
      </section>

      <div className="reveal reveal-4 grid gap-4 xl:grid-cols-[1.32fr_0.68fr]">
        <ProductionPanel />
        <ActivityFeed />
      </div>
    </div>
  );
}
