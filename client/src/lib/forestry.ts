export type Species = "oak" | "birch" | "spruce" | "acacia" | "dark_oak";

export const SPECIES: { id: Species; label: string; color: string; yield: number }[] = [
  { id: "oak", label: "Oak", color: "oklch(0.74 0.11 120)", yield: 6 },
  { id: "birch", label: "Birch", color: "oklch(0.84 0.07 95)", yield: 4 },
  { id: "spruce", label: "Spruce", color: "oklch(0.62 0.09 155)", yield: 7 },
  { id: "acacia", label: "Acacia", color: "oklch(0.72 0.12 55)", yield: 5 },
  { id: "dark_oak", label: "Dark oak", color: "oklch(0.5 0.07 70)", yield: 8 },
];

export type HarvestState = "queued" | "active" | "paused" | "done";

export type HarvestJob = {
  id: string;
  zone: string;
  grid: string;
  radius: number;
  species: Species[];
  replant: boolean;
  deposit: string;
  state: HarvestState;
  progress: number;
  logs: number;
  planted: number;
  startedAt: number;
};

export function speciesMeta(id: Species) {
  return SPECIES.find((entry) => entry.id === id) ?? SPECIES[0];
}

export function jobYield(job: HarvestJob): number {
  const trees = Math.max(8, Math.round(job.radius * 3.2));
  const average =
    job.species.reduce((sum, id) => sum + speciesMeta(id).yield, 0) /
    Math.max(1, job.species.length);
  return Math.round(trees * average * (job.progress / 100));
}

export function nextJobId(jobs: HarvestJob[]): string {
  return `H-${String(jobs.length + 1).padStart(2, "0")}`;
}

export const initialJobs: HarvestJob[] = [
  {
    id: "H-04",
    zone: "North Ridge",
    grid: "S04 · 24, -180",
    radius: 36,
    species: ["spruce", "birch"],
    replant: true,
    deposit: "S04 · output chest",
    state: "active",
    progress: 62,
    logs: 428,
    planted: 61,
    startedAt: Date.now() - 1000 * 60 * 42,
  },
  {
    id: "H-05",
    zone: "Cedar Hollow",
    grid: "S05 · 24, -420",
    radius: 28,
    species: ["oak", "dark_oak"],
    replant: true,
    deposit: "S05 · output chest",
    state: "queued",
    progress: 0,
    logs: 0,
    planted: 0,
    startedAt: 0,
  },
  {
    id: "H-03",
    zone: "Old Growth",
    grid: "S02 · 24, -60",
    radius: 40,
    species: ["dark_oak", "spruce"],
    replant: false,
    deposit: "S02 · output chest",
    state: "done",
    progress: 100,
    logs: 712,
    planted: 0,
    startedAt: Date.now() - 1000 * 60 * 60 * 5,
  },
];
