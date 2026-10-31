import { useState } from "react";
import { RefreshCw, Database, Watch } from "lucide-react";
import { cn } from "@/lib/utils";
import { poseLabel, stationLabel, shortId, turtleName } from "@/lib/format";
import { useConsole } from "@/lib/use-console";
import { PageHeader, SectionHead } from "@/components/common/page-header";
import { StatBand } from "@/components/common/stat-band";
import { Readout } from "@/components/common/readout";
import { StatusDot } from "@/components/common/status-dot";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Chest } from "@/lib/types";

export function StationDetailTab() {
  const { snapshot, refresh } = useConsole();
  if (!snapshot) return null;

  const stations = snapshot.stations ?? [];
  const chests = snapshot.chests ?? [];
  const shaftLocks = snapshot.shaftLocks ?? [];

  const [selectedStationId, setSelectedStationId] = useState<string>(
    stations[0]?.id ?? ""
  );

  const chestsByStation = new Map<string, Chest[]>();
  for (const chest of chests) {
    const list = chestsByStation.get(chest.stationId) ?? [];
    list.push(chest);
    chestsByStation.set(chest.stationId, list);
  }

  const selectedStation =
    selectedStationId
      ? stations.find((s) => s.id === selectedStationId)
      : undefined;
  const stationChests = selectedStation ? chestsByStation.get(selectedStationId) ?? [] : [];

  const storageChests = stationChests.filter((c) => c.kind === "storage");
  const refuelChest = stationChests.find((c) => c.kind === "refuel");
  const filled = storageChests.filter((c) => (c.fillPercent ?? 0) > 0).length;
  const pct = storageChests.length > 0 ? Math.round((filled / storageChests.length) * 100) : 0;

  const shaftLock = shaftLocks.find((l) => l.stationId === selectedStationId);
  const holder = shaftLock?.holderTurtleId
    ? snapshot.turtles.find((t) => t.id === shaftLock.holderTurtleId)
    : undefined;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="operations / 05 · station deployment"
        title="Station detail"
        description="Per-station chest map, fill levels, and shaft queue status."
        actions={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw data-icon="inline-start" />
            Sync
          </Button>
        }
      />

      {/* Station selector */}
      <section className="flex flex-col gap-3">
        <SectionHead
          kicker="stations"
          title="Stations"
          description={stations.length === 0 ? "No stations yet. Register a turtle as station_builder to create one." : undefined}
        />
        {stations.length === 0 ? (
          <div className="rounded-xl border border-border/80 bg-card/30 p-4">
            <p className="mono text-[10px] text-muted-foreground">
              Install a turtle and assign the "station builder" role from the Deployment tab.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {stations.map((station) => {
              const isSelected = selectedStationId === station.id;
              const stationChestList = chestsByStation.get(station.id) ?? [];
              const sFilled = stationChestList.filter(
                (c) => c.kind === "storage" && (c.fillPercent ?? 0) > 0
              ).length;
              const sPct =
                stationChestList.filter((c) => c.kind === "storage").length > 0
                  ? Math.round(
                      (sFilled / stationChestList.filter((c) => c.kind === "storage").length) *
                        100
                    )
                  : 0;
              return (
                <Button
                  key={station.id}
                  onClick={() => setSelectedStationId(station.id)}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "w-32 justify-between",
                    isSelected ? "border-signal bg-signal/10" : ""
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Database className="size-3.5" aria-hidden="true" />
                    <span className="mono text-sm">{station.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2">
                    <StatusDot
                      tone={station.built ? "live" : "warning"}
                      pulse={station.built}
                    />
                    <span className="mono text-[9px]">{stationLabel(station.index, station.id)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[9px]">
                    <span>{sPct}% filled</span>
                    <span className={`mono ${sPct >= 87 ? "text-warning" : "text-muted-foreground"}`}>
                      ({sFilled}/32)
                    </span>
                  </div>
                </Button>
              );
            })}
          </div>
        )}
      </section>

      {selectedStation && (
        <>
          {/* Station overview */}
          <section className="flex flex-col gap-3">
            <SectionHead
              kicker="station"
              title={selectedStation.name}
              description={stationLabel(selectedStation.index, selectedStation.id)}
            />
            <StatBand
              items={[
                {
                  label: "status",
                  value: selectedStation.built ? "built" : "building",
                  tone: selectedStation.built ? "live" : "warning",
                },
                {
                  label: "storage chests",
                  value: storageChests.length,
                  unit: "of 32",
                },
                {
                  label: "fill level",
                  value: `${pct}%`,
                  hint: `${filled}/${storageChests.length}`,
                  tone: pct >= 87 ? "warning" : "muted",
                },
                {
                  label: "refuel chest",
                  value: refuelChest ? "placed" : "missing",
                },
                {
                  label: "shaft",
                  value: selectedStation.shaftPose ? poseLabel(selectedStation.shaftPose) : "not set",
                },
                {
                  label: "room (Y10)",
                  value: selectedStation.roomPose ? poseLabel(selectedStation.roomPose) : "not set",
                },
              ]}
            />
          </section>

          {/* Chest map */}
          <section className="flex flex-col gap-3">
            <SectionHead
              kicker="chests"
              title="Underground storage chests"
              description="32 storage chests + 1 refueling chest placed in a 12×12 room at Y10."
            />
            <div className="grid grid-cols-4 gap-2 max-w-[420px]">
              {/* Header row */}
              <div className="col-span-4">
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                  <span className="w-8 text-center">z\\x</span>
                  {[0, 2, 4, 6, 8, 10].map((x) => (
                    <span key={x} className="w-6 text-center mono">
                      {x}
                    </span>
                  ))}
                </div>
              </div>
              {([1, 3, 5, 7, 9, 11] as number[]).map((z) => (
                <div key={z} className="col-span-4">
                  <div className="flex items-center gap-2">
                    <span className="w-8 text-right text-[9px] text-muted-foreground mono">
                      {z}
                    </span>
                    {[0, 2, 4, 6, 8, 10].map((x) => {
                      const chest = stationChests.find(
                        (c) =>
                          c.kind === "storage" &&
                          c.pose &&
                          c.pose.x === selectedStation!.anchor.x + x &&
                          c.pose.z === selectedStation!.anchor.z + z
                      );
                      const isRefuel =
                        refuelChest &&
                        refuelChest.pose &&
                        refuelChest.pose.x === selectedStation!.anchor.x + x &&
                        refuelChest.pose.z === selectedStation!.anchor.z + z;
                      const fill = chest ? (chest.fillPercent ?? 0) : 0;
                      const hasItem = fill > 0;
                      return (
                        <div
                          key={`${x}-${z}`}
                          className={cn(
                            "w-6 h-6 rounded border flex items-center justify-center text-[9px] mono",
                            isRefuel
                              ? "border-info bg-info/20 text-info"
                              : hasItem
                                ? fill >= 87
                                  ? "border-warning bg-warning/20 text-warning"
                                  : "border-live bg-live/20 text-live"
                                : "border-border bg-background/25 text-muted-foreground"
                          )}
                          title={cn(
                            isRefuel ? "Refuel chest" : chest?.label ?? "Empty",
                            hasItem ? ` - ${fill}% filled` : ""
                          )}
                        >
                          {isRefuel ? "R" : chest ? Math.min(fill / 10, 9) : "·"}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border border-info bg-info/20" />
                Refuel
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border border-live bg-live/20" />
                1-80% filled
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border border-warning bg-warning/20" />
                80%+ filled
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border border-border bg-background/25" />
                Empty
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded border border-border bg-background/25" />
                · No chest
              </span>
            </div>
          </section>

          {/* Shaft queue */}
          <section className="flex flex-col gap-3">
            <SectionHead kicker="shaft" title="Shaft queue" />
            <div className="rounded-xl border border-border/80 bg-card/30 p-4">
              <div className="grid grid-cols-2 gap-4 text-[10px]">
                <Readout label="status" value={shaftLock ? "held" : "free"} />
                <Readout label="holder" value={holder ? turtleName(holder) : "—"} />
                <Readout
                  label="queue"
                  value={shaftLock?.queue.length ?? 0}
                />
                {shaftLock?.expiresAt && (
                  <Readout
                    label="expires"
                    value={Math.max(0, Math.round((shaftLock.expiresAt - Date.now()) / 1000))}
                    unit="s"
                  />
                )}
              </div>
              {shaftLock?.queue && shaftLock.queue.length > 0 && (
                <div className="mt-3 border-t border-border/60 pt-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Watch className="size-3 text-muted-foreground" aria-hidden="true" />
                    <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      waiting
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {shaftLock.queue.slice(0, 5).map((turtleId, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="mono text-[9px] text-muted-foreground">{i + 1}.</span>
                        <span className="mono text-[10px] truncate w-24">
                          {shortId(turtleId)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Chest list */}
          <section className="flex flex-col gap-3">
            <SectionHead kicker="chest-list" title="Chest registry" />
            <div className="rounded-xl border border-border/80 bg-card/30 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">id</TableHead>
                    <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">kind</TableHead>
                    <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">label</TableHead>
                    <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">position</TableHead>
                    <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">fill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...stationChests].sort((a, b) => a.id.localeCompare(b.id)).map((chest) => (
                    <TableRow key={chest.id}>
                      <TableCell className="mono text-[10px]">{chest.id}</TableCell>
                      <TableCell className="mono text-[10px]">{chest.kind}</TableCell>
                      <TableCell className="mono text-[10px] text-muted-foreground">
                        {chest.label ?? "—"}
                      </TableCell>
                      <TableCell className="mono text-[10px]">
                        {chest.pose ? poseLabel(chest.pose) : "not set"}
                      </TableCell>
                      <TableCell className="mono text-[10px]">
                        {chest.fillPercent ?? 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
