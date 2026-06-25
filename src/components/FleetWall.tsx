import { useEffect } from "react";
import { useFleet } from "../fleetStore";
import { useStore } from "../store";
import { useT } from "../i18n";
import { PROFILES } from "../mock/profiles";
import { isTauri } from "../api/tauriTransport";

/** Simultaneous monitoring wall for multiple cameras, with one-tap control switch. */
export function FleetWall() {
  const cameras = useFleet((s) => s.cameras);
  const add = useFleet((s) => s.add);
  const start = useFleet((s) => s.startPolling);
  const stop = useFleet((s) => s.stopPolling);
  const store = useStore();
  const t = useT();

  // Seed the fleet: mock profiles in the browser, recent hosts in the app.
  useEffect(() => {
    if (cameras.length > 0) return;
    if (!isTauri()) {
      for (const p of PROFILES) add({ id: `mock:${p.id}`, label: p.label, useMock: true, mockProfile: p.id });
    } else {
      for (const h of store.recentHosts) add({ id: h, label: h, useMock: false, host: h, secure: store.secure });
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  function control(cam: (typeof cameras)[number]) {
    if (cam.useMock) {
      store.setUseMock(true);
      store.setMockProfile(cam.mockProfile!);
    } else {
      store.setUseMock(false);
      store.setHost(cam.host!);
      store.setSecure(cam.secure ?? false);
    }
    setTimeout(() => useStore.getState().connect(), 0);
  }

  const activeId = store.useMock ? `mock:${store.mockProfile}` : store.host;

  return (
    <section className="panel p-4 col-span-full">
      <header className="flex items-center gap-2 mb-3">
        <span className="text-[var(--color-accent-2)]">▦</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t("fleet.title")}</h2>
      </header>

      {cameras.length === 0 ? (
        <span className="text-xs text-[var(--color-muted)]">{t("fleet.empty")}</span>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
          {cameras.map((c) => {
            const isActive = c.id === activeId && store.conn === "connected";
            const onAir = c.tally === "Program" || c.recording;
            return (
              <div
                key={c.id}
                className={`rounded-xl border p-3 flex flex-col gap-2 ${
                  onAir ? "border-[var(--color-accent)] glow-rec" : "border-[var(--color-edge)]"
                } bg-[var(--color-panel-2)]`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{c.device || c.label}</span>
                  <span className={`w-2 h-2 rounded-full ${c.online ? "bg-[var(--color-good)]" : "bg-[var(--color-muted)]"}`} />
                </div>
                <div className="flex items-center gap-2">
                  {c.tally === "Program" ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--color-accent)] text-white tally-live">PGM</span>
                  ) : c.tally === "Preview" ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--color-good)] text-black">PVW</span>
                  ) : (
                    <span className="text-[10px] text-[var(--color-muted)]">—</span>
                  )}
                  {c.recording && <span className="text-[10px] text-[var(--color-accent)] font-bold">● REC</span>}
                  <span className="ml-auto text-[10px] text-[var(--color-muted)] tabular-nums">{c.battery ?? ""}</span>
                </div>
                <button
                  onClick={() => control(c)}
                  disabled={isActive}
                  className={`text-xs py-1 rounded-lg transition ${
                    isActive
                      ? "bg-[var(--color-accent-2)] text-black"
                      : "bg-[var(--color-panel)] border border-[var(--color-edge)] hover:border-[var(--color-accent-2)]"
                  }`}
                >
                  {isActive ? "●" : t("fleet.control")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
