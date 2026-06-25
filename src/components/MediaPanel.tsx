import { useEffect, useState } from "react";
import { useStore } from "../store";
import { PANEL_META } from "../api/registry";
import { useT } from "../i18n";

const SLOTS = "/media/slots";
const WORKINGSET = "/media/workingset";
const ACTIVE = "/media/active";
const FILESYSTEMS = "/media/devices/doformatSupportedFilesystems";

interface WsDevice {
  volume?: string;
  deviceName?: string;
  remainingRecordTime?: number;
  totalSpace?: number;
  remainingSpace?: number;
  clipCount?: number;
}

/** Storage media overview: slots, working set, and (destructive) format. */
export function MediaPanel() {
  const available = useStore((s) => s.available);
  const slots = useStore((s) => s.propertyData[SLOTS]);
  const ws = useStore((s) => s.propertyData[WORKINGSET]);
  const active = useStore((s) => s.propertyData[ACTIVE]);
  const transport = useStore((s) => s.transport);
  const fetchOptions = useStore((s) => s.fetchOptions);
  const fsPayload = useStore((s) => s.options[FILESYSTEMS]);
  const setError = useStore.setState;
  const t = useT();

  const [filesystem, setFilesystem] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (available.has(SLOTS) || available.has(WORKINGSET)) fetchOptions(FILESYSTEMS);
  }, [available, fetchOptions]);

  if (!available.has(SLOTS) && !available.has(WORKINGSET)) return null;
  const meta = PANEL_META.media;

  const slotList: any[] = Array.isArray(slots) ? slots : slots?.slots ?? [];
  const devices: WsDevice[] = (ws?.workingset ?? []).filter((d: any): d is WsDevice => !!d?.deviceName);
  const filesystems: string[] = Array.isArray(fsPayload) ? fsPayload : fsPayload?.filesystems ?? [];
  const fs = filesystem || filesystems[0] || "";

  async function format(dev: WsDevice) {
    if (!transport || !dev.deviceName) return;
    if (!window.confirm(`${t("media.formatConfirm")}\n\n${dev.volume ?? dev.deviceName} → ${fs}`)) return;
    setBusy(dev.deviceName);
    try {
      const enc = dev.deviceName.split("/").map(encodeURIComponent).join("/");
      // Step 1: obtain a one-time format key.
      const keyRes = await transport.request("GET", `/media/devices/${enc}/doformat`);
      if (keyRes.status !== 200) throw new Error(`key ${keyRes.status}`);
      const { key } = JSON.parse(keyRes.body);
      // Step 2: perform the format with the key.
      const putRes = await transport.request("PUT", `/media/devices/${enc}/doformat`, {
        key,
        filesystem: fs,
        volume: dev.volume ?? "Untitled",
      });
      if (putRes.status >= 400) throw new Error(`format ${putRes.status}`);
      // Refresh the working set.
      const refreshed = await transport.request("GET", WORKINGSET);
      if (refreshed.status === 200) {
        useStore.setState((s) => ({ propertyData: { ...s.propertyData, [WORKINGSET]: JSON.parse(refreshed.body) } }));
      }
    } catch (e: any) {
      setError({ error: `${t("media.formatFailed")}: ${e?.message ?? e}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2 mb-1">
        <span className="text-[var(--color-accent-2)]">{meta.icon}</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t("panel.media")}</h2>
      </header>

      {/* Mounted devices with format action */}
      {devices.map((d) => (
        <div key={d.deviceName} className="rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] px-3 py-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm">{d.volume || d.deviceName}</span>
            <button
              onClick={() => format(d)}
              disabled={busy === d.deviceName || !fs}
              className="text-xs px-2 py-1 rounded-md border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition disabled:opacity-50"
            >
              {busy === d.deviceName ? t("media.formatting") : t("media.format")}
            </button>
          </div>
          <div className="text-[10px] text-[var(--color-muted)] tabular-nums">
            {gb(d.remainingSpace)} {t("media.free")} / {gb(d.totalSpace)}
            {d.clipCount != null ? ` · ${d.clipCount} ${t("media.clips")}` : ""}
          </div>
        </div>
      ))}

      {/* Raw slot list */}
      {slotList.length > 0
        ? slotList.map((s, i) => (
            <div key={s?.index ?? i} className="flex items-center justify-between rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] px-3 py-2">
              <span className="text-sm">
                {t("media.slot")} {s?.index ?? i}
              </span>
              <span className="text-xs text-[var(--color-muted)]">{s?.type ?? "—"}</span>
            </div>
          ))
        : devices.length === 0 && <span className="text-xs text-[var(--color-muted)]">{t("media.none")}</span>}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-muted)]">{t("media.workingSet")}</span>
        <span className="text-sm tabular-nums">{ws?.size ?? "—"}</span>
      </div>

      {filesystems.length > 0 && devices.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--color-muted)]">{t("media.filesystem")}</span>
          <select
            value={fs}
            onChange={(e) => setFilesystem(e.target.value)}
            className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1 text-sm outline-none min-w-[100px]"
          >
            {filesystems.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      )}

      {active?.deviceName && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--color-muted)]">{t("media.active")}</span>
          <span className="text-sm">{active.deviceName}</span>
        </div>
      )}
    </section>
  );
}

function gb(bytes?: number): string {
  if (bytes == null) return "—";
  return `${(bytes / 1e9).toFixed(0)} GB`;
}
