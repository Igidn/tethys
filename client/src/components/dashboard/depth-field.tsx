import { turtleName } from "@/lib/format";
import type { PublicTurtle, Snapshot, TurtleRole } from "@/lib/types";

const W = 1040;
const H = 300;
const PAD = { top: 22, right: 26, bottom: 36, left: 54 };

const roleColor: Record<TurtleRole, string> = {
  miner: "var(--signal)",
  lumberjack: "var(--live)",
  hauler: "var(--info)",
  station_builder: "var(--signal)",
  unassigned: "var(--muted-foreground)",
};

function jitter(seed: number): number {
  const value = Math.sin(seed * 127.1) * 43758.5453;
  return value - Math.floor(value);
}

export function DepthField({ snapshot }: { snapshot: Snapshot }) {
  const stations = [...snapshot.stations].sort((a, b) => a.index - b.index);
  const online = new Set(snapshot.online);
  const top = snapshot.config.baseY + 6;
  const bottom = Math.min(snapshot.config.bottomWorldY - 6, -20);
  const usableW = W - PAD.left - PAD.right;
  const usableH = H - PAD.top - PAD.bottom;

  if (stations.length === 0) {
    return (
      <div className="console-grid flex h-[240px] items-center justify-center rounded-lg border border-dashed border-border/70">
        <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
          No stations yet. The cross-section fills in as turtles register and the first shafts are
          sunk.
        </p>
      </div>
    );
  }

  const xAt = (index: number) =>
    stations.length === 1
      ? PAD.left + usableW / 2
      : PAD.left + (index / Math.max(1, stations.length - 1)) * usableW;
  const yAt = (worldY: number) =>
    PAD.top + ((top - worldY) / Math.max(1, top - bottom)) * usableH;

  const depthTicks = [0, -20, -40, -58].filter((value) => value <= top && value >= bottom);
  const bands = 11;
  const bandHeight = usableH / bands;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Live mine cross-section with stations, turtles, and recent ore finds"
    >
      <defs>
        <linearGradient id="shaft-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.05" />
          <stop offset="100%" stopColor="var(--signal)" stopOpacity="0.42" />
        </linearGradient>
        <pattern id="rock-lines" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M0 18 18 0" stroke="oklch(0.62 0.02 100)" strokeOpacity="0.05" strokeWidth="1" />
        </pattern>
      </defs>

      {Array.from({ length: bands }).map((_, index) => {
        const y = PAD.top + index * bandHeight;
        const worldY = top - (index / bands) * (top - bottom);
        const label = Math.round(worldY / 2) * 2;
        return (
          <g key={index}>
            <rect
              x={PAD.left}
              y={y}
              width={usableW}
              height={bandHeight}
              fill={index % 2 === 0 ? "oklch(0.205 0.015 102)" : "oklch(0.19 0.014 104)"}
              fillOpacity={0.55}
            />
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y}
              y2={y}
              stroke="oklch(0.55 0.02 100)"
              strokeOpacity="0.09"
            />
            {index % 2 === 0 ? (
              <text
                x={PAD.left - 10}
                y={y + 3}
                textAnchor="end"
                className="mono"
                fill="var(--muted-foreground)"
                fontSize="8"
                opacity="0.7"
              >
                Y {label}
              </text>
            ) : null}
          </g>
        );
      })}
      <rect
        x={PAD.left}
        y={PAD.top}
        width={usableW}
        height={usableH}
        fill="url(#rock-lines)"
      />

      {Array.from({ length: 46 }).map((_, index) => {
        const x = PAD.left + jitter(index + 1) * usableW;
        const y = PAD.top + jitter(index + 71) * usableH;
        return (
          <circle
            key={`rock-${index}`}
            cx={x}
            cy={y}
            r={jitter(index + 23) * 0.9 + 0.25}
            fill="oklch(0.78 0.02 100)"
            opacity={0.1 + jitter(index + 9) * 0.08}
          />
        );
      })}

      {depthTicks.map((value) => (
        <g key={value}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yAt(value)}
            y2={yAt(value)}
            stroke="oklch(0.6 0.02 100)"
            strokeOpacity="0.1"
            strokeDasharray="2 7"
          />
          <text
            x={W - PAD.right}
            y={yAt(value) - 4}
            textAnchor="end"
            className="mono"
            fill="var(--muted-foreground)"
            fontSize="8"
            opacity="0.55"
          >
            {value}
          </text>
        </g>
      ))}

      {stations.map((station, index) => {
        const x = xAt(index);
        const turtles = snapshot.turtles.filter((turtle) => turtle.stationId === station.id);
        const ores = snapshot.oreRecent.filter((cell) => cell.stationId === station.id);
        const dockY = yAt(station.anchor.y);
        const deepest = turtles.reduce((value, turtle) => {
          const worldY = station.anchor.y + (turtle.pose?.y ?? 0);
          return Math.min(value, worldY);
        }, station.anchor.y);
        const shaftBottom = yAt(Math.max(bottom, deepest));

        return (
          <g key={station.id}>
            <line
              x1={x}
              x2={x}
              y1={dockY}
              y2={yAt(bottom)}
              stroke="oklch(0.72 0.02 100)"
              strokeOpacity="0.16"
              strokeDasharray="2 5"
            />
            <line
              x1={x}
              x2={x}
              y1={dockY}
              y2={shaftBottom}
              stroke="url(#shaft-glow)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />

            {ores.map((cell, oreIndex) => {
              const oreY = yAt(station.anchor.y + cell.y);
              const oreX = x + Math.max(-18, Math.min(18, cell.x * 0.32));
              return (
                <circle
                  key={`${station.id}-ore-${oreIndex}`}
                  cx={oreX}
                  cy={oreY}
                  r={1.5}
                  fill={oreColor(cell.name)}
                  opacity={0.85}
                >
                  <title>{`${cell.name} at ${cell.x}, ${cell.y}, ${cell.z}`}</title>
                </circle>
              );
            })}

            {turtles.map((turtle) => (
              <TurtlePip
                key={turtle.id}
                turtle={turtle}
                x={x}
                worldY={station.anchor.y + (turtle.pose?.y ?? 0)}
                y={yAt(station.anchor.y + (turtle.pose?.y ?? 0))}
                isOnline={online.has(turtle.id)}
                stationIndex={station.index}
              />
            ))}

            <circle cx={x} cy={dockY} r={2} fill="oklch(0.78 0.02 100)" opacity="0.6" />
            <text
              x={x}
              y={H - 14}
              textAnchor="middle"
              className="mono"
              fill="var(--foreground)"
              fontSize="8.5"
              opacity="0.8"
            >
              S{String(station.index).padStart(2, "0")}
            </text>
            <text
              x={x}
              y={H - 4}
              textAnchor="middle"
              className="mono"
              fill="var(--muted-foreground)"
              fontSize="7"
              opacity="0.55"
            >
              {turtles.length} unit{turtles.length === 1 ? "" : "s"}
            </text>
          </g>
        );
      })}

      <text
        x={PAD.left}
        y={PAD.top - 9}
        className="mono"
        fill="var(--muted-foreground)"
        fontSize="8"
        opacity="0.7"
      >
        SURFACE / DOCK Y {snapshot.config.baseY}
      </text>
    </svg>
  );
}

function TurtlePip({
  turtle,
  x,
  y,
  worldY,
  isOnline,
  stationIndex,
}: {
  turtle: PublicTurtle;
  x: number;
  y: number;
  worldY: number;
  isOnline: boolean;
  stationIndex: number;
}) {
  const color = roleColor[turtle.role] ?? roleColor.unassigned;
  const active = isOnline && ["mining", "returning", "working"].includes(turtle.state.toLowerCase());

  return (
    <g>
      {active ? (
        <circle cx={x} cy={y} r={9} fill="none" stroke={color} strokeOpacity="0.35">
          <animate attributeName="r" values="5;12;5" dur="3.6s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.45;0;0.45" dur="3.6s" repeatCount="indefinite" />
        </circle>
      ) : null}
      <circle
        cx={x}
        cy={y}
        r={4.5}
        fill={isOnline ? color : "var(--background)"}
        stroke={color}
        strokeWidth={1.2}
        strokeOpacity={isOnline ? 0.9 : 0.45}
        opacity={isOnline ? 1 : 0.55}
      />
      <circle cx={x} cy={y} r={1.4} fill={isOnline ? "var(--background)" : color} opacity="0.9" />
      <title>
        {`${turtleName(turtle)} · S${String(stationIndex).padStart(2, "0")} · Y ${worldY} · ${
          isOnline ? turtle.state : "offline"
        }`}
      </title>
    </g>
  );
}

function oreColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("diamond")) return "var(--ore-diamond)";
  if (lower.includes("emerald")) return "var(--ore-emerald)";
  if (lower.includes("gold")) return "var(--ore-gold)";
  if (lower.includes("redstone")) return "var(--ore-redstone)";
  if (lower.includes("lapis")) return "var(--ore-lapis)";
  if (lower.includes("copper")) return "var(--ore-copper)";
  if (lower.includes("iron")) return "oklch(0.8 0.03 95)";
  if (lower.includes("coal")) return "oklch(0.5 0.015 100)";
  return "var(--signal)";
}
