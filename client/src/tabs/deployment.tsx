import { useState } from "react";
import {
  Plus,
  RefreshCw,
  ShieldAlert,
  Terminal,
  UserPlus,
  Watch,
} from "lucide-react";
import { toast } from "sonner";
import { poseLabel, stationLabel, shortId, turtleName } from "@/lib/format";
import { useConsole } from "@/lib/use-console";
import { PageHeader, SectionHead } from "@/components/common/page-header";
import { StatBand } from "@/components/common/stat-band";
import { EmptyState } from "@/components/common/empty-state";
import { Readout } from "@/components/common/readout";
import { StatusDot } from "@/components/common/status-dot";
import { TurtleChip } from "@/components/common/turtle-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Chest, ItemRequest, PublicTurtle, ShaftLock, Station } from "@/lib/types";

export function DeploymentTab() {
  const { snapshot, apiFetch, refresh } = useConsole();
  if (!snapshot) return null;

  // Null-safe defaults for new snapshot fields (older state files may lack them)
  const turtles = snapshot.turtles ?? [];
  const stations = snapshot.stations ?? [];
  const chests = snapshot.chests ?? [];
  const requests = snapshot.requests ?? [];
  const shaftLocks = snapshot.shaftLocks ?? [];

  const [requestItem, setRequestItem] = useState("");
  const [requestCount, setRequestCount] = useState("1");
  const [requestStation, setRequestStation] = useState(stations[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [assigning, setAssigning] = useState<Set<string>>(new Set());

  const unassigned = turtles.filter((t) => t.role === "unassigned");
  const stationBuilders = turtles.filter((t) => t.role === "station_builder");
  const haulers = turtles.filter((t) => t.role === "hauler");

  // Chests grouped by station
  const chestsByStation = new Map<string, Chest[]>();
  for (const chest of chests) {
    const list = chestsByStation.get(chest.stationId) ?? [];
    list.push(chest);
    chestsByStation.set(chest.stationId, list);
  }

  // Requests by station
  const requestsByStation = new Map<string, ItemRequest[]>();
  for (const request of requests) {
    const list = requestsByStation.get(request.stationId) ?? [];
    list.push(request);
    requestsByStation.set(request.stationId, list);
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const assignedRequests = requests.filter((r) => r.status === "assigned");

  const assignRole = async (turtleId: string, role: string, stationId: string) => {
    setAssigning((prev) => new Set(prev).add(turtleId));
    try {
      const response = await apiFetch(
        `/api/turtles/${encodeURIComponent(turtleId)}/assign-role`,
        { method: "POST", body: JSON.stringify({ role, stationId: stationId || undefined }) },
      );
      const payload = (await response.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        error?: string;
      };
      if (response.ok && payload.ok) {
        const station = stations.find((entry) => entry.id === stationId);
        toast.success("Role assigned", {
          description: station ? stationLabel(station.index, station.id) : undefined,
        });
        void refresh();
      } else {
        toast.error(payload.error ?? "Failed to assign role");
      }
    } finally {
      setAssigning((prev) => {
        const next = new Set(prev);
        next.delete(turtleId);
        return next;
      });
    }
  };

  const createRequest = async () => {
    if (!requestItem || !requestCount || !requestStation) return;
    const count = Number(requestCount);
    if (!Number.isFinite(count) || count <= 0) return;
    setSubmitting(true);
    try {
      const response = await apiFetch("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          stationId: requestStation,
          requestedBy: "operator",
          itemName: requestItem,
          count,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        error?: string;
      };
      if (response.ok && payload.ok) {
        setRequestItem("");
        setRequestCount("1");
        toast.success("Item request created");
        void refresh();
      } else {
        toast.error(payload.error ?? "Failed to create request");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (requestId: string) => {
    const response = await apiFetch(
      `/api/requests/${encodeURIComponent(requestId)}/cancel`,
      { method: "POST" },
    );
    const payload = (await response.json().catch(() => ({ ok: false }))) as {
      ok?: boolean;
      error?: string;
    };
    if (response.ok && payload.ok) {
      toast.success("Request cancelled");
      void refresh();
    } else {
      toast.error(payload.error ?? "Failed to cancel request");
    }
  };

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="operations / 05 · station deployment"
        title="Deploy and manage mining stations."
        description="Assign turtle roles, watch station construction, request items up, and monitor the shaft queue."
        meta={
          <span>
            {stationBuilders.length} station builder{stationBuilders.length === 1 ? "" : "s"} ·{" "}
            {haulers.length} hauler{haulers.length === 1 ? "" : "s"} ·{" "}
            {unassigned.length} awaiting role
          </span>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw data-icon="inline-start" />
            Sync
          </Button>
        }
      />

      {/* ---- Role assignment ---- */}
      <section className="flex flex-col gap-3">
        <SectionHead
          kicker="roles"
          title="Turtle role assignment"
          description="New turtles register as unassigned. Choose both a role and a station; miners and haulers default to a built station, while station builders keep the anchor created at registration. The installer is blocked until the role is assigned."
        />
        {unassigned.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No turtles awaiting role"
            description="All registered turtles have a role assigned."
          />
        ) : (
          <div className="rounded-xl border border-border/80 bg-card/30 p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">turtle</TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">station</TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">role</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {unassigned.map((turtle) => (
                  <PendingRoleRow
                    key={turtle.id}
                    turtle={turtle}
                    stations={stations}
                    assigning={assigning.has(turtle.id)}
                    onAssign={assignRole}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ---- Station overview ---- */}
      <section className="flex flex-col gap-3">
        <SectionHead
          kicker="stations"
          title="Station status"
          description="Each station has a shaft, a 12×12 room at Y10, 32 storage chests, and a refueling chest."
        />
        <StatBand
          items={[
            {
              label: "stations",
              value: stations.length,
              unit: "total",
            },
            {
              label: "built",
              value: stations.filter((s) => s.built).length,
              unit: "complete",
            },
            {
              label: "storage chests",
              value: chests.filter((c) => c.kind === "storage").length,
              unit: "underground",
            },
            {
              label: "refuel chests",
              value: chests.filter((c) => c.kind === "refuel").length,
              unit: "underground",
            },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              chests={chestsByStation.get(station.id) ?? []}
              shaftLock={shaftLocks.find((l) => l.stationId === station.id)}
            />
          ))}
        </div>
      </section>

      {/* ---- Item requests ---- */}
      <section className="flex flex-col gap-3">
        <SectionHead
          kicker="requests"
          title="Item requests"
          description="Request ores or blocks from underground storage. The hauler brings them up to the surface depot chest."
        />
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="flex flex-col gap-1">
            <label className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">item</label>
            <Input
              value={requestItem}
              onChange={(e) => setRequestItem(e.target.value)}
              placeholder="e.g. minecraft:iron_ore"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">count</label>
            <Input
              type="number"
              value={requestCount}
              onChange={(e) => setRequestCount(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">station</label>
            <div className="w-[180px]">
              <Select
                value={requestStation}
                onValueChange={setRequestStation}
              >
                <SelectTrigger>
                  <SelectValue placeholder="station" />
                </SelectTrigger>
                <SelectContent>
                  {stations.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {stationLabel(s.index, s.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={createRequest}
            disabled={submitting || !requestItem || !requestCount || !requestStation}
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <span className="relative size-4">loading</span>
              </span>
            ) : (
              <Plus data-icon="inline-start" />
            )}
            Request
          </Button>
        </div>

        {(pendingRequests.length > 0 || assignedRequests.length > 0) && (
          <div className="mt-4 rounded-xl border border-border/80 bg-card/30 p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">item</TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">count</TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">station</TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">status</TableHead>
                  <TableHead className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">hauler</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...pendingRequests, ...assignedRequests].map(
                  (request) => {
                    const station = stations.find((s) => s.id === request.stationId);
                    const hauler = request.haulerId ? turtles.find((t) => t.id === request.haulerId) : undefined;
                    return (
                      <TableRow key={request.id}>
                        <TableCell className="mono text-[10px]">{request.itemName}</TableCell>
                        <TableCell className="mono text-[10px]">{request.count}</TableCell>
                        <TableCell className="mono text-[10px] text-muted-foreground">
                          {station ? stationLabel(station.index, station.id) : "—"}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            <StatusDot
                              tone={request.status === "pending" ? "warning" : "signal"}
                              pulse={request.status === "assigned"}
                            />
                            <span className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                              {request.status}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="mono text-[10px] text-muted-foreground">
                          {hauler ? turtleName(hauler) : "—"}
                        </TableCell>
                        <TableCell>
                          {request.status === "pending" && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => void cancelRequest(request.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ---- Shaft queue ---- */}
      <section className="flex flex-col gap-3">
        <SectionHead
          kicker="shaft"
          title="Shaft queue"
          description="One shaft per station. The server grants access to one turtle at a time; others wait in a FIFO queue."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => {
            const lock = shaftLocks.find((l) => l.stationId === station.id);
            const holder = lock?.holderTurtleId ? turtles.find((t) => t.id === lock.holderTurtleId) : undefined;
            return (
              <ShaftCard
                key={station.id}
                station={station}
                lock={lock}
                holder={holder}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PendingRoleRow({
  turtle,
  stations,
  assigning,
  onAssign,
}: {
  turtle: PublicTurtle;
  stations: Station[];
  assigning: boolean;
  onAssign: (turtleId: string, role: string, stationId: string) => Promise<void>;
}) {
  const ownStation = stations.find((station) => station.id === turtle.stationId);
  const builtStations = stations.filter(
    (station) => station.built && station.id !== turtle.stationId,
  );
  const otherStations = stations
    .filter((station) => station.id !== turtle.stationId)
    .sort((a, b) => a.index - b.index);
  const workStationId =
    builtStations[0]?.id ?? otherStations[0]?.id ?? ownStation?.id ?? stations[0]?.id ?? "";
  const [role, setRole] = useState("station_builder");
  const [stationId, setStationId] = useState(ownStation?.id ?? workStationId);

  const changeRole = (value: string) => {
    setRole(value);
    if (value === "station_builder") {
      setStationId(ownStation?.id ?? workStationId);
    } else {
      setStationId(workStationId);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <TurtleChip turtle={turtle} size="sm" />
          <span className="mono text-[10px]">{shortId(turtle.id)}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="w-[190px]">
          <Select value={stationId} onValueChange={setStationId}>
            <SelectTrigger>
              <SelectValue placeholder="choose a station" />
            </SelectTrigger>
            <SelectContent>
              {stations.map((station) => (
                <SelectItem key={station.id} value={station.id}>
                  {stationLabel(station.index, station.id)} · {station.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TableCell>
      <TableCell>
        <div className="w-[150px]">
          <Select value={role} onValueChange={changeRole}>
            <SelectTrigger>
              <SelectValue placeholder="role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="station_builder">Station Builder</SelectItem>
              <SelectItem value="miner">Miner</SelectItem>
              <SelectItem value="hauler">Hauler</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </TableCell>
      <TableCell>
        <Button
          size="xs"
          onClick={() => void onAssign(turtle.id, role, stationId)}
          disabled={assigning || !stationId}
        >
          {assigning ? "…" : "Assign"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function StationCard({
  station,
  chests,
  shaftLock,
}: {
  station: Station;
  chests: Chest[];
  shaftLock?: ShaftLock | null;
}) {
  const storageChests = chests.filter((c) => c.kind === "storage");
  const refuelChest = chests.find((c) => c.kind === "refuel");
  const filled = storageChests.filter((c) => (c.fillPercent ?? 0) > 0).length;
  const pct = storageChests.length > 0 ? Math.round((filled / storageChests.length) * 100) : 0;

  return (
    <section className="rounded-xl border border-border/80 bg-card/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="mono text-sm font-medium">{station.name}</span>
            <span className="mono text-[9px] text-muted-foreground">{stationLabel(station.index, station.id)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StatusDot tone={station.built ? "live" : "warning"} pulse={station.built} />
            <span className="mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              {station.built ? "built" : "building"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <Readout label="fill" value={`${pct}%`} hint={`${filled}/${storageChests.length}`} tone={pct >= 87 ? "warning" : "muted"} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[10px]">
        <Readout label="shaft" value={station.shaftPose ? poseLabel(station.shaftPose) : "not set"} />
        <Readout label="room (Y10)" value={station.roomPose ? poseLabel(station.roomPose) : "not set"} />
        <Readout label="storage chests" value={storageChests.length} hint="of 32" />
        <Readout label="refuel chest" value={refuelChest ? "placed" : "missing"} />
      </div>

      {shaftLock && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2 mb-1">
            <Watch className="size-3 text-muted-foreground" aria-hidden="true" />
            <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">shaft queue</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="mono text-[10px]">
              {shaftLock.holderTurtleId ? "holder" : "free"}
            </span>
            {shaftLock.holderTurtleId ? (
              <span className="mono text-[10px] text-muted-foreground">{shortId(shaftLock.holderTurtleId)}</span>
            ) : null}
            {shaftLock.queue && shaftLock.queue.length > 0 && (
              <span className="ml-2 mono text-[10px] text-warning">
                {shaftLock.queue.length} waiting
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ShaftCard({
  station,
  lock,
  holder,
}: {
  station: Station;
  lock: ShaftLock | null | undefined;
  holder?: PublicTurtle | undefined;
}) {
  const queueLen = lock?.queue.length ?? 0;
  const isHeld = !!lock?.holderTurtleId;

  return (
    <section className="rounded-xl border border-border/80 bg-card/30 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="mono text-sm font-medium">{station.name}</span>
          </div>
          <span className="mono text-[9px] text-muted-foreground">shaft {station.index}</span>
        </div>
        <span className="mono text-[10px] font-medium">
          {isHeld ? "held" : "free"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[10px]">
        <Readout label="holder" value={holder ? turtleName(holder) : "—"} />
        <Readout label="queue" value={queueLen} />
        {lock?.expiresAt && (
          <Readout label="expires" value={Math.max(0, Math.round((lock.expiresAt - Date.now()) / 1000))} unit="s" />
        )}
      </div>

      {queueLen > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <span className="mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">waiting</span>
          <div className="mt-1 flex flex-col gap-1">
            {lock?.queue.slice(0, 3).map((turtleId, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="mono text-[9px] text-muted-foreground">{i + 1}.</span>
                <span className="mono text-[10px] truncate w-24">{shortId(turtleId)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
