import type { MissionSummary } from "@/lib/types";
import { isBranchMineSpec, isMiningProgress } from "../../lib/types";

const W = 680;
const H = 292;

export function SectorSchematic({ mission }: { mission: MissionSummary }) {
  // Only render for branchMine missions
  if (!isBranchMineSpec(mission.spec)) return null;
  if (!isMiningProgress(mission.progress)) return null;

  const { spec, progress, plan } = mission;
  const half = Math.max(4, spec.maxRadius);
  const spacing = Math.max(1, spec.spacing);
  const strips = Math.max(1, plan.strips);
  const layers = Math.max(1, plan.layers);
  const currentLayer = Math.max(0, Math.min(layers - 1, progress.layer));
  const currentStrip = Math.max(0, Math.min(strips - 1, progress.strip));
  const active = mission.state === "active" || mission.state === "offered";

  const S = 216;
  const left = 54;
  const top = 34;
  const right = left + S;
  const bottom = top + S;
  const scale = S / (2 * half);
  const zAt = (worldZ: number) => top + (worldZ + half) * scale;

  const currentZ = -half + currentStrip * spacing;
  const offsetRatio = Math.min(1, Math.max(0, progress.offset / Math.max(1, 2 * half)));
  const markerX =
    currentStrip % 2 === 0 ? left + offsetRatio * S : right - offsetRatio * S;
  const markerY = zAt(currentZ);

  const sideX = 412;
  const sideW = 220;
  const sideTop = 40;
  const sideBottom = 262;
  const depthTop = spec.startY;
  const depthBottom = spec.endY;
  const depthAt = (localY: number) =>
    sideTop + ((localY - depthTop) / Math.max(1, depthBottom - depthTop)) * (sideBottom - sideTop);
  const layerY = depthAt(spec.startY - currentLayer * spec.layerStep);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Sector schematic for mission ${mission.id}. Layer ${currentLayer + 1} of ${layers}, strip ${currentStrip + 1} of ${strips}.`}
    >
      <defs>
        <pattern id="sector-grid" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M18 0H0V18" fill="none" stroke="var(--border)" strokeOpacity="0.4" strokeWidth="1" />
        </pattern>
        <linearGradient id="layer-glow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--signal)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--signal)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <text x={left} y={22} className="mono" fill="var(--muted-foreground)" fontSize="8.5" opacity="0.8">
        TOP-DOWN / CURRENT LAYER
      </text>
      <text x={sideX} y={22} className="mono" fill="var(--muted-foreground)" fontSize="8.5" opacity="0.8">
        CROSS-SECTION / ALL LAYERS
      </text>

      <rect x={left} y={top} width={S} height={S} fill="url(#sector-grid)" />
      <rect
        x={left}
        y={top}
        width={S}
        height={S}
        fill="none"
        stroke="var(--border)"
        strokeOpacity="0.8"
      />

      {Array.from({ length: Math.max(0, strips) }).map((_, strip) => {
        const z = -half + strip * spacing;
        if (z > half) return null;
        const y = zAt(z);
        const isCurrent = strip === currentStrip;
        const isPast = strip < currentStrip;
        return (
          <g key={strip}>
            <line
              x1={left}
              x2={right}
              y1={y}
              y2={y}
              stroke={isCurrent ? "var(--signal)" : "var(--foreground)"}
              strokeOpacity={isCurrent ? 0.9 : isPast ? 0.3 : 0.1}
              strokeWidth={isCurrent ? 1.6 : 1}
            />
            {strip < strips - 1 ? (
              <line
                x1={strip % 2 === 0 ? right : left}
                x2={strip % 2 === 0 ? right : left}
                y1={y}
                y2={zAt(-half + (strip + 1) * spacing)}
                stroke={strip === currentStrip ? "var(--signal)" : "var(--foreground)"}
                strokeOpacity={strip <= currentStrip ? 0.28 : 0.08}
                strokeWidth={1}
              />
            ) : null}
          </g>
        );
      })}

      <line
        x1={left + S / 2}
        x2={left + S / 2}
        y1={top}
        y2={bottom}
        stroke="var(--signal)"
        strokeOpacity="0.18"
        strokeDasharray="2 5"
      />
      <line
        x1={left}
        x2={right}
        y1={top + S / 2}
        y2={top + S / 2}
        stroke="var(--signal)"
        strokeOpacity="0.18"
        strokeDasharray="2 5"
      />

      <circle cx={left + S / 2} cy={top + S / 2} r={3} fill="var(--signal)" opacity="0.9" />
      <text
        x={left + S / 2 + 7}
        y={top + S / 2 - 6}
        className="mono"
        fill="var(--signal)"
        fontSize="7.5"
        opacity="0.85"
      >
        SHAFT
      </text>

      {active ? (
        <g>
          <circle cx={markerX} cy={markerY} r={8} fill="var(--signal)" opacity="0.1">
            <animate attributeName="r" values="4;12;4" dur="3.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.18;0;0.18" dur="3.2s" repeatCount="indefinite" />
          </circle>
          <circle cx={markerX} cy={markerY} r={3.6} fill="var(--signal)" />
          <circle cx={markerX} cy={markerY} r={1.2} fill="var(--background)" />
        </g>
      ) : (
        <circle cx={markerX} cy={markerY} r={3} fill="var(--muted-foreground)" opacity="0.8" />
      )}

      <text x={left} y={bottom + 15} className="mono" fill="var(--muted-foreground)" fontSize="8">
        {2 * half} × {2 * half} blocks
      </text>
      <text
        x={right}
        y={bottom + 15}
        textAnchor="end"
        className="mono"
        fill="var(--muted-foreground)"
        fontSize="8"
      >
        strip {currentStrip + 1}/{strips} · layer {currentLayer + 1}/{layers}
      </text>

      <text x={left} y={bottom + 34} className="mono" fill="var(--muted-foreground)" fontSize="8">
        N ↑ / -Z
      </text>
      <text
        x={right}
        y={bottom + 34}
        textAnchor="end"
        className="mono"
        fill="var(--muted-foreground)"
        fontSize="8"
      >
        spacing {spacing}
      </text>

      <line
        x1={370}
        x2={370}
        y1={36}
        y2={270}
        stroke="var(--border)"
        strokeOpacity="0.6"
        strokeDasharray="2 6"
      />

      <rect x={sideX} y={sideTop} width={sideW} height={sideBottom - sideTop} fill="url(#sector-grid)" />
      <rect
        x={sideX}
        y={sideTop}
        width={sideW}
        height={sideBottom - sideTop}
        fill="none"
        stroke="var(--border)"
        strokeOpacity="0.8"
      />

      {Array.from({ length: layers }).map((_, layer) => {
        const y = depthAt(spec.startY - layer * spec.layerStep);
        const current = layer === currentLayer;
        return (
          <g key={layer}>
            <line
              x1={sideX}
              x2={sideX + sideW}
              y1={y}
              y2={y}
              stroke={current ? "var(--signal)" : "var(--foreground)"}
              strokeOpacity={current ? 0.75 : 0.08}
              strokeWidth={current ? 1.4 : 1}
            />
            {layer % 5 === 0 || current ? (
              <text
                x={sideX + sideW + 5}
                y={y + 2.5}
                className="mono"
                fill={current ? "var(--signal)" : "var(--muted-foreground)"}
                fontSize="7"
                opacity={current ? 0.9 : 0.5}
              >
                L{layer}
              </text>
            ) : null}
          </g>
        );
      })}

      {currentLayer > 0 ? (
        <rect
          x={sideX}
          y={layerY - 4}
          width={sideW}
          height={8}
          fill="url(#layer-glow)"
          opacity="0.9"
        />
      ) : null}

      <line
        x1={sideX + sideW / 2}
        x2={sideX + sideW / 2}
        y1={sideTop}
        y2={sideBottom}
        stroke="var(--signal)"
        strokeOpacity="0.25"
        strokeDasharray="2 5"
      />
      <rect
        x={sideX + sideW / 2 - 5}
        y={layerY - 3}
        width={10}
        height={6}
        rx={1.5}
        fill="var(--signal)"
      />
      <text
        x={sideX + sideW / 2 + 10}
        y={layerY + 15}
        className="mono"
        fill="var(--signal)"
        fontSize="7.5"
      >
        now · Y {spec.startY - currentLayer * spec.layerStep}
      </text>

      <text x={sideX} y={sideBottom + 15} className="mono" fill="var(--muted-foreground)" fontSize="8">
        depth {Math.abs(spec.endY)} · step {spec.layerStep}
      </text>
      <text
        x={sideX + sideW}
        y={sideBottom + 15}
        textAnchor="end"
        className="mono"
        fill="var(--muted-foreground)"
        fontSize="8"
      >
        Y {spec.endY}
      </text>
    </svg>
  );
}