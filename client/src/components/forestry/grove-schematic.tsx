import type { MissionSummary } from "@/lib/types";
import { isTimberSpec } from "../../lib/types";
import { speciesMeta } from "@/lib/forestry";

const W = 640;
const H = 320;
const CX = 320;
const CY = 164;
const R = 118;

const speciesColor: Record<string, string> = {
  oak: "oklch(0.74 0.11 120)",
  birch: "oklch(0.84 0.07 95)",
  spruce: "oklch(0.62 0.09 155)",
  acacia: "oklch(0.72 0.12 55)",
  dark_oak: "oklch(0.5 0.07 70)",
};

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Tree = {
  x: number;
  y: number;
  angle: number;
  species: string;
  scale: number;
};

function getSpec(job: MissionSummary) {
  return isTimberSpec(job.spec) ? job.spec : null;
}

function getSpecies(job: MissionSummary): string[] {
  const spec = getSpec(job);
  return spec?.species ?? ["oak"];
}

function getRadius(job: MissionSummary): number {
  const spec = getSpec(job);
  return spec?.radius ?? 32;
}

function getReplant(job: MissionSummary): boolean {
  const spec = getSpec(job);
  return spec?.replant ?? true;
}

function getGrid(job: MissionSummary): string {
  return job.grid ?? "unassigned";
}

function getZone(job: MissionSummary): string {
  return job.zone ?? "Unnamed Grove";
}

function treesFor(job: MissionSummary): Tree[] {
  const species = getSpecies(job);
  const radius = getRadius(job);
  const random = rng(hash(`${job.id}:${getZone(job)}:${species.join(",")}`));
  const count = Math.min(46, Math.max(12, Math.round(radius * 0.9)));
  return Array.from({ length: count }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * (R - 18);
    const sp = species[index % Math.max(1, species.length)] ?? "oak";
    return {
      x: CX + Math.cos(angle) * distance,
      y: CY + Math.sin(angle) * distance * 0.82,
      angle: (angle + Math.PI * 2) % (Math.PI * 2),
      species: sp,
      scale: 0.8 + random() * 0.45,
    };
  }).sort((a, b) => a.angle - b.angle);
}

function TreeGlyph({ tree, cut }: { tree: Tree; cut: boolean }) {
  const color = speciesColor[tree.species] ?? speciesColor.oak;
  const scale = tree.scale;
  if (cut) {
    return (
      <g opacity={0.42}>
        <line
          x1={tree.x}
          y1={tree.y}
          x2={tree.x}
          y2={tree.y - 3 * scale}
          stroke="oklch(0.62 0.06 70)"
          strokeWidth={1.4}
        />
        <ellipse
          cx={tree.x}
          cy={tree.y - 3 * scale}
          rx={2.2 * scale}
          ry={0.9 * scale}
          fill="oklch(0.6 0.06 70)"
        />
      </g>
    );
  }

  if (tree.species === "spruce") {
    return (
      <g opacity={0.9}>
        <line
          x1={tree.x}
          y1={tree.y}
          x2={tree.x}
          y2={tree.y - 3 * scale}
          stroke="oklch(0.55 0.05 65)"
          strokeWidth={1}
        />
        <path
          d={`M${tree.x} ${tree.y - 13 * scale} L${tree.x + 4.2 * scale} ${tree.y - 3 * scale} L${tree.x - 4.2 * scale} ${tree.y - 3 * scale} Z`}
          fill={color}
          fillOpacity={0.72}
          stroke={color}
          strokeOpacity={0.5}
          strokeWidth={0.6}
        />
      </g>
    );
  }

  if (tree.species === "acacia") {
    return (
      <g opacity={0.9}>
        <line
          x1={tree.x}
          y1={tree.y}
          x2={tree.x}
          y2={tree.y - 4 * scale}
          stroke="oklch(0.55 0.05 65)"
          strokeWidth={1}
        />
        <ellipse
          cx={tree.x}
          cy={tree.y - 8 * scale}
          rx={5.2 * scale}
          ry={2.6 * scale}
          fill={color}
          fillOpacity={0.68}
        />
      </g>
    );
  }

  return (
    <g opacity={0.92}>
      <line
        x1={tree.x}
        y1={tree.y}
        x2={tree.x}
        y2={tree.y - 4 * scale}
        stroke="oklch(0.55 0.05 65)"
        strokeWidth={1}
      />
      <circle
        cx={tree.x}
        cy={tree.y - 7 * scale}
        r={(tree.species === "dark_oak" ? 4.6 : 3.8) * scale}
        fill={color}
        fillOpacity={0.62}
        stroke={color}
        strokeOpacity={0.55}
        strokeWidth={0.5}
      />
    </g>
  );
}

export function GroveSchematic({ job }: { job: MissionSummary }) {
  const trees = treesFor(job);
  const progressValue = "cycles" in job.progress ? job.progress.cycles : job.progress;
  const progress = typeof progressValue === "number" ? progressValue : 0;
  const cutCount = Math.round((progress / 100) * trees.length);
  const scanAngle = (progress / 100) * Math.PI * 2 - Math.PI / 2;
  const scanX = CX + Math.cos(scanAngle) * R;
  const scanY = CY + Math.sin(scanAngle) * R * 0.82;
  const progressArc = Math.max(0.001, (progress / 100) * Math.PI * 2);
  const radius = getRadius(job);
  const replant = getReplant(job);
  const grid = getGrid(job);
  const zone = getZone(job);
  const species = getSpecies(job);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Grove preview for ${zone}. ${job.progress}% harvested, ${species.length} species planned.`}
    >
      <defs>
        <pattern id="grove-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="var(--border)" strokeOpacity="0.4" strokeWidth="1" />
        </pattern>
        <radialGradient id="grove-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--live)" stopOpacity="0.05" />
          <stop offset="100%" stopColor="var(--live)" stopOpacity="0.015" />
        </radialGradient>
        <clipPath id="grove-clip">
          <ellipse cx={CX} cy={CY} rx={R} ry={R * 0.82} />
        </clipPath>
      </defs>

      <rect x="20" y="18" width={W - 40} height={H - 36} fill="url(#grove-grid)" rx="6" />
      <text x="34" y="38" className="mono" fill="var(--muted-foreground)" fontSize="8.5" opacity="0.75">
        GROVE PLAN / TOP-DOWN
      </text>
      <text x={W - 34} y="38" textAnchor="end" className="mono" fill="var(--muted-foreground)" fontSize="8.5" opacity="0.65">
        {grid}
      </text>

      <ellipse cx={CX} cy={CY} rx={R + 12} ry={(R + 12) * 0.82} fill="none" stroke="var(--border)" strokeOpacity="0.75" />
      <ellipse cx={CX} cy={CY} rx={R} ry={R * 0.82} fill="url(#grove-fill)" stroke="var(--live)" strokeOpacity="0.28" />
      <ellipse cx={CX} cy={CY} rx={R * 0.62} ry={R * 0.62 * 0.82} fill="none" stroke="var(--live)" strokeOpacity="0.1" strokeDasharray="2 6" />
      <ellipse cx={CX} cy={CY} rx={R * 0.3} ry={R * 0.3 * 0.82} fill="none" stroke="var(--live)" strokeOpacity="0.1" strokeDasharray="2 6" />

      <g clipPath="url(#grove-clip)">
        {trees.map((tree, index) => (
          <TreeGlyph key={`${job.id}-${index}`} tree={tree} cut={index < cutCount} />
        ))}
      </g>

      <path
        d={`M${CX} ${CY} L${CX + Math.cos(-Math.PI / 2) * R} ${CY + Math.sin(-Math.PI / 2) * R * 0.82}`}
        stroke="var(--live)"
        strokeOpacity="0.22"
        strokeDasharray="2 5"
      />
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke="var(--signal)"
        strokeOpacity="0.42"
        strokeWidth="1.4"
        strokeDasharray={`${progressArc * R} 1000`}
        transform={`rotate(-90 ${CX} ${CY})`}
        opacity={job.state === "offered" ? 0.3 : 1}
      />

      {job.state !== "offered" ? (
        <>
          <line
            x1={CX}
            y1={CY}
            x2={scanX}
            y2={scanY}
            stroke="var(--signal)"
            strokeOpacity="0.32"
            strokeWidth="1"
          />
          <circle cx={scanX} cy={scanY} r="2.6" fill="var(--signal)" opacity="0.9" />
        </>
      ) : null}

      <rect x={CX - 6} y={CY - 6} width="12" height="12" rx="2" fill="var(--surface)" stroke="var(--signal)" strokeWidth="1.2" />
      <circle cx={CX} cy={CY} r="1.6" fill="var(--signal)" />
      <text x={CX + 12} y={CY - 10} className="mono" fill="var(--signal)" fontSize="8">
        CREW
      </text>

      <text x={CX} y={H - 40} textAnchor="middle" className="mono" fill="var(--foreground)" fontSize="9" opacity="0.85">
        {zone}
      </text>
      <text x={CX} y={H - 27} textAnchor="middle" className="mono" fill="var(--muted-foreground)" fontSize="7.5" opacity="0.65">
        radius {radius} · {replant ? "replant on" : "clear cut"} · {species.length} species
      </text>

      <text x="34" y={H - 40} className="mono" fill="var(--muted-foreground)" fontSize="7.5">
        N ↑ / -Z
      </text>
      <text x={W - 34} y={H - 40} textAnchor="end" className="mono" fill="var(--muted-foreground)" fontSize="7.5">
        {progress}% harvested
      </text>

      <g>
        <circle cx={W - 54} cy={H - 26} r={2} fill="var(--live)" />
        <text x={W - 46} y={H - 23} className="mono" fill="var(--muted-foreground)" fontSize="7">
          standing
        </text>
        <circle cx={W - 118} cy={H - 26} r={2} fill="oklch(0.6 0.06 70)" opacity="0.7" />
        <text x={W - 110} y={H - 23} className="mono" fill="var(--muted-foreground)" fontSize="7">
          cut
        </text>
      </g>

      {species.map((id, index) => {
        const meta = speciesMeta(id as "oak" | "birch" | "spruce" | "acacia" | "dark_oak");
        return (
          <g key={id}>
            <circle cx={34 + index * 74} cy={H - 23} r={2.2} fill={speciesColor[id] ?? speciesColor.oak} />
            <text x={41 + index * 74} y={H - 20} className="mono" fill="var(--muted-foreground)" fontSize="7">
              {meta.label.toLowerCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}