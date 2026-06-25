import { useState } from "react";
import { useStore } from "./store";
import { FleetWall } from "./components/FleetWall";
import { TabBar } from "./components/TabBar";
import { ConnectBar } from "./components/ConnectBar";
import { Panel } from "./components/Panel";
import { SlatePanel } from "./components/SlatePanel";
import { MediaPanel } from "./components/MediaPanel";
import { SystemFormatPanel } from "./components/SystemFormatPanel";
import { MonitoringOutputPanel } from "./components/MonitoringOutputPanel";
import { RecordingHud } from "./components/RecordingHud";
import { ScenesPanel } from "./components/ScenesPanel";
import { ConfigBar } from "./components/ConfigBar";
import { ApiConsole } from "./components/ApiConsole";
import { PANEL_ORDER } from "./api/registry";
import { useLang, useT } from "./i18n";

export default function App() {
  const conn = useStore((s) => s.conn);
  const propertyData = useStore((s) => s.propertyData);
  const sessionCount = useStore((s) => s.order.length);
  const t = useT();
  const [showFleet, setShowFleet] = useState(false);
  const recording = !!propertyData["/transports/0/record"]?.recording;
  const tally = propertyData["/camera/tallyStatus"];
  const onAir = recording || tally?.program || tally?.status === "Program";

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-[rgba(11,14,19,0.8)] border-b border-[var(--color-edge)]">
        <div className="px-5 py-3 flex flex-col gap-3 max-w-[1400px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-[var(--color-accent)]" />
              <h1 className="text-base font-bold tracking-tight">
                Bm <span className="text-[var(--color-muted)] font-normal">{t("app.subtitle")}</span>
              </h1>
            </div>
            {onAir && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--color-accent)] text-white tally-live">
                ● {t("onair")}
              </span>
            )}
            {onAir && <GuardToggle />}
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setShowFleet((v) => !v)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition ${
                  showFleet
                    ? "bg-[var(--color-accent-2)] text-black border-[var(--color-accent-2)]"
                    : "bg-[var(--color-panel-2)] border-[var(--color-edge)] hover:border-[var(--color-accent-2)]"
                }`}
              >
                ▦ {t("fleet.show")}
              </button>
              <ConfigBar />
              <LangSwitch />
            </div>
          </div>
          <ConnectBar />
          <TabBar />
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-5 py-5 max-w-[1400px] mx-auto w-full flex flex-col gap-4">
        {showFleet && (
          <div className="grid grid-cols-1">
            <FleetWall />
          </div>
        )}
        {sessionCount === 0 ? (
          <EmptyState />
        ) : conn === "connected" ? (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-start">
            <RecordingHud />
            {PANEL_ORDER.map((g) => (
              <Panel key={g} group={g} />
            ))}
            <MonitoringOutputPanel />
            <SystemFormatPanel />
            <SlatePanel />
            <MediaPanel />
            <ScenesPanel />
            <ApiConsole />
          </div>
        ) : (
          <div className="flex items-center justify-center py-24 text-[var(--color-muted)] text-sm">
            {t("conn.connecting")}
          </div>
        )}
      </main>
    </div>
  );
}

function GuardToggle() {
  const guard = useStore((s) => s.programGuard);
  const setGuard = useStore((s) => s.setProgramGuard);
  const t = useT();
  return (
    <button
      onClick={() => setGuard(!guard)}
      title={guard ? t("guard.on") : t("guard.off")}
      className={`px-2 py-0.5 rounded text-xs border transition ${
        guard
          ? "border-[var(--color-good)] text-[var(--color-good)]"
          : "border-[var(--color-edge)] text-[var(--color-muted)]"
      }`}
    >
      {guard ? "🔒" : "🔓"} {guard ? t("guard.on") : t("guard.off")}
    </button>
  );
}

function LangSwitch() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  return (
    <div className="flex rounded-lg overflow-hidden border border-[var(--color-edge)] text-xs">
      {(["en", "ja"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2.5 py-1 ${lang === l ? "bg-[var(--color-accent-2)] text-black" : "bg-[var(--color-panel-2)] text-[var(--color-muted)]"}`}
        >
          {l === "en" ? "EN" : "日本語"}
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-24 text-[var(--color-muted)]">
      <div className="text-5xl opacity-30">◉</div>
      <p className="text-sm max-w-md">
        {t("empty.line1")}
        <br />
        {t("empty.line2")}
      </p>
    </div>
  );
}
