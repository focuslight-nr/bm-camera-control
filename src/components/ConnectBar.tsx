import { useState } from "react";
import { useStore } from "../store";
import { PROFILES } from "../mock/profiles";
import { isTauri } from "../api/tauriTransport";
import { discoverCameras, type Discovered } from "../api/discovery";
import { useT } from "../i18n";

export function ConnectBar() {
  const s = useStore();
  const t = useT();
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<Discovered[]>([]);

  async function scan() {
    setScanning(true);
    try {
      setFound(await discoverCameras());
    } finally {
      setScanning(false);
    }
  }

  // Fill the host from a chip; only auto-connect if no credentials are required
  // (HTTPS with Secure login needs username/password entered first).
  function pickHost(h: string) {
    s.setHost(h);
    const needsCreds = s.secure && !(s.username && s.password);
    if (!needsCreds) setTimeout(() => useStore.getState().connect(), 0);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Source toggle */}
      <div className="flex rounded-lg overflow-hidden border border-[var(--color-edge)]">
        <button
          className={`px-3 py-1.5 text-xs ${!s.useMock ? "bg-[var(--color-accent-2)] text-black" : "bg-[var(--color-panel-2)]"}`}
          onClick={() => s.setUseMock(false)}
         
        >
          {t("conn.camera")}
        </button>
        <button
          className={`px-3 py-1.5 text-xs ${s.useMock ? "bg-[var(--color-accent-2)] text-black" : "bg-[var(--color-panel-2)]"}`}
          onClick={() => s.setUseMock(true)}
         
        >
          {t("conn.mock")}
        </button>
      </div>

      {s.useMock ? (
        <select
          value={s.mockProfile}
          onChange={(e) => s.setMockProfile(e.target.value)}
         
          className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1.5 text-sm outline-none"
        >
          {PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            placeholder={t("conn.hostPlaceholder")}
            value={s.host}
            onChange={(e) => s.setHost(e.target.value)}
           
            className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent-2)] min-w-[200px]"
          />
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <input type="checkbox" checked={s.secure} onChange={(e) => s.setSecure(e.target.checked)} />
            {t("conn.https")}
          </label>
          {s.secure && (
            <>
              <input
                placeholder={t("conn.username")}
                value={s.username}
                onChange={(e) => s.setUsername(e.target.value)}
                autoComplete="off"
                className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent-2)] w-[110px]"
              />
              <input
                type="password"
                placeholder={t("conn.password")}
                value={s.password}
                onChange={(e) => s.setPassword(e.target.value)}
                autoComplete="off"
                className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent-2)] w-[110px]"
              />
            </>
          )}
          {isTauri() && (
            <button
              onClick={scan}
              disabled={scanning}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] hover:border-[var(--color-accent-2)] transition disabled:opacity-50"
            >
              {scanning ? t("conn.scanning") : t("conn.scan")}
            </button>
          )}
          {!isTauri() && (
            <span className="text-[10px] text-[var(--color-accent)]">{t("conn.browserWarning")}</span>
          )}
        </>
      )}

      {found.length > 0 && (
        <div className="w-full flex flex-wrap items-center gap-1.5">
          {found.map((d) => (
            <button
              key={d.host}
              onClick={() => pickHost(d.host)}
              className="px-2 py-0.5 text-[11px] rounded-md bg-[var(--color-panel-2)] border border-[var(--color-accent-2)] hover:bg-[var(--color-accent-2)] hover:text-black transition"
            >
              {d.productName || d.host} · {d.host}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => s.connect()}
        disabled={!s.useMock && !s.host.trim()}
        className="px-4 py-1.5 rounded-lg text-sm font-medium transition bg-[var(--color-accent-2)] text-black hover:opacity-90 disabled:opacity-40"
      >
        {t("conn.connect")}
      </button>

      {s.conn === "connected" && (
        <button
          onClick={() => s.disconnect()}
          title={t("conn.disconnect")}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition bg-[var(--color-panel-2)] border border-[var(--color-edge)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          {t("conn.disconnect")}
        </button>
      )}

      {/* Device + status */}
      <div className="flex items-center gap-3 ml-auto">
        {s.device.productName && (
          <div className="text-right leading-tight">
            <div className="text-sm text-[var(--color-ink)]">{s.device.productName}</div>
            <div className="text-[10px] text-[var(--color-muted)]">v{s.device.softwareVersion}</div>
          </div>
        )}
        <StatusDot conn={s.conn} />
      </div>

      {!s.useMock && s.recentHosts.length > 0 && (
        <div className="w-full flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-[var(--color-muted)]">{t("conn.recent")}:</span>
          {s.recentHosts.map((h) => (
            <button
              key={h}
              onClick={() => pickHost(h)}
              className="px-2 py-0.5 text-[11px] rounded-md bg-[var(--color-panel-2)] border border-[var(--color-edge)] hover:border-[var(--color-accent-2)] transition"
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {s.error && <div className="w-full text-xs text-[var(--color-accent)]">⚠ {s.error}</div>}
    </div>
  );
}

function StatusDot({ conn }: { conn: string }) {
  const t = useT();
  const color =
    conn === "connected" ? "var(--color-good)" : conn === "connecting" ? "var(--color-accent-2)" : conn === "error" ? "var(--color-accent)" : "var(--color-muted)";
  const label =
    conn === "connected" ? t("status.connected") : conn === "connecting" ? t("status.connecting") : conn === "error" ? t("status.error") : t("status.disconnected");
  return (
    <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
