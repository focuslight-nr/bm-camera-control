import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";

/** Compact recording status: REC/STBY, elapsed, remaining time, clips, free space. */
export function RecordingHud() {
  const available = useStore((s) => s.available);
  const rec = useStore((s) => s.propertyData["/transports/0/record"]);
  const ws = useStore((s) => s.propertyData["/media/workingset"]);
  const t = useT();

  const recording = !!rec?.recording;
  const startRef = useRef<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (recording && startRef.current == null) startRef.current = Date.now();
    if (!recording) startRef.current = null;
  }, [recording]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  if (!available.has("/transports/0/record")) return null;

  const device = (ws?.workingset ?? []).find((d: any) => d?.deviceName);
  const elapsed = recording && startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0;

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-bold ${
            recording ? "bg-[var(--color-accent)] text-white tally-live" : "bg-[var(--color-panel-2)] text-[var(--color-muted)] border border-[var(--color-edge)]"
          }`}
        >
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${recording ? "bg-white" : "bg-[var(--color-muted)]"}`} />
          {recording ? t("hud.recording") : t("hud.standby")}
        </span>
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{fmtClock(elapsed)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label={t("hud.remaining")} value={device?.remainingRecordTime != null ? fmtClock(device.remainingRecordTime) : "—"} />
        <Stat label={t("hud.clips")} value={device?.clipCount != null ? String(device.clipCount) : "—"} />
        <Stat label={t("hud.space")} value={device?.remainingSpace != null ? `${(device.remainingSpace / 1e9).toFixed(0)}G` : "—"} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] py-2">
      <div className="text-sm tabular-nums text-[var(--color-ink)]">{value}</div>
      <div className="text-[10px] text-[var(--color-muted)]">{label}</div>
    </div>
  );
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
