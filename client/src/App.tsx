import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConsoleProvider, useConsole } from "@/lib/use-console";
import { AppShell } from "@/components/shell/app-shell";
import { BootScreen } from "@/components/shell/boot-screen";
import { LockScreen } from "@/components/shell/lock-screen";
import { OfflineScreen } from "@/components/shell/offline-screen";
import { TABS, type TabId } from "@/components/shell/tabs";
import { OverviewTab } from "@/tabs/overview";
import { MiningTab } from "@/tabs/mining";
import { ForestryTab } from "@/tabs/forestry";
import { FleetTab } from "@/tabs/fleet";
import { EventsTab } from "@/tabs/events";
import { SettingsTab } from "@/tabs/settings";
import { DeploymentTab } from "@/tabs/deployment";
import { StationDetailTab } from "@/tabs/station-detail";

function readTab(): TabId {
  const value = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const match = TABS.find((tab) => tab.id === value);
  return match?.id ?? "overview";
}

function ConsoleApp() {
  const { snapshot, status } = useConsole();
  const [tab, setTab] = useState<TabId>(() => readTab());

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

  const change = (next: TabId) => {
    setTab(next);
    if (window.location.hash.replace(/^#\/?/, "") !== next) {
      window.location.hash = next;
    }
  };

  if (status === "unauthorized") return <LockScreen />;
  if (!snapshot) {
    if (status === "offline") return <OfflineScreen />;
    return <BootScreen />;
  }

  return (
    <AppShell active={tab} onChange={change}>
      <div hidden={tab !== "forestry"}>
        <ForestryTab />
      </div>
      {tab === "overview" ? <OverviewTab /> : null}
      {tab === "mining" ? <MiningTab /> : null}
      {tab === "fleet" ? <FleetTab /> : null}
      {tab === "events" ? <EventsTab /> : null}
      {tab === "settings" ? <SettingsTab /> : null}
      {tab === "deployment" ? <DeploymentTab /> : null}
      {tab === "station-detail" ? <StationDetailTab /> : null}
    </AppShell>
  );
}

export default function App() {
  return (
    <ConsoleProvider>
      <TooltipProvider delayDuration={240}>
        <ConsoleApp />
        <Toaster position="bottom-right" closeButton />
      </TooltipProvider>
    </ConsoleProvider>
  );
}
