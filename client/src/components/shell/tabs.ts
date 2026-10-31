import {
  Bot,
  Building2,
  Database,
  LayoutDashboard,
  Pickaxe,
  ScrollText,
  SlidersHorizontal,
  Trees,
  type LucideIcon,
} from "lucide-react";

export type TabId = "overview" | "mining" | "forestry" | "fleet" | "events" | "settings" | "deployment" | "station-detail";

export type TabDef = {
  id: TabId;
  label: string;
  short: string;
  icon: LucideIcon;
  group: "operations" | "fleet" | "record";
  preview?: boolean;
  description: string;
};

export const TABS: TabDef[] = [
  {
    id: "overview",
    label: "Command deck",
    short: "Deck",
    icon: LayoutDashboard,
    group: "operations",
    description: "Attention, readiness, and the live mine.",
  },
  {
    id: "mining",
    label: "Mining",
    short: "Mining",
    icon: Pickaxe,
    group: "operations",
    description: "Missions, sectors, and trip control.",
  },
  {
    id: "forestry",
    label: "Forestry",
    short: "Forestry",
    icon: Trees,
    group: "operations",
    description: "Harvest queue preview.",
    preview: true,
  },
  {
    id: "fleet",
    label: "Fleet",
    short: "Fleet",
    icon: Bot,
    group: "fleet",
    description: "Turtles, roles, cargo, and stations.",
  },
  {
    id: "events",
    label: "Event log",
    short: "Events",
    icon: ScrollText,
    group: "record",
    description: "Everything the fleet reported.",
  },
  {
    id: "settings",
    label: "Settings",
    short: "Settings",
    icon: SlidersHorizontal,
    group: "record",
    description: "Runtime geometry and access.",
  },
  {
    id: "deployment",
    label: "Station Deployment",
    short: "Deploy",
    icon: Building2,
    group: "fleet",
    description: "Role assignment, station chests, item requests, and shaft queue.",
  },
  {
    id: "station-detail",
    label: "Station Detail",
    short: "Stations",
    icon: Database,
    group: "fleet",
    description: "Per-station chest map, fill levels, and shaft queue status.",
  },
];

export function tabById(id: string): TabDef {
  return TABS.find((tab) => tab.id === id) ?? TABS[0];
}
