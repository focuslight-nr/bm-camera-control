import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";

/** Tabs for the live camera sessions; switch instantly without reconnecting. */
export function TabBar() {
  const sessions = useStore((s) => s.sessions);
  const order = useStore((s) => s.order);
  const activeId = useStore((s) => s.activeId);
  const switchTo = useStore((s) => s.switchTo);
  const close = useStore((s) => s.closeCamera);
  const copyLook = useStore((s) => s.copyLookToOthers);
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);

  if (order.length === 0) return null;

  async function copy() {
    const r = await copyLook();
    setMsg(`${t("tab.copied")} ${r.applied} → ${r.cameras} ${t("tab.cameras")}`);
    setTimeout(() => setMsg(null), 3500);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {order.map((id) => {
        const s = sessions[id];
        if (!s) return null;
        const active = id === activeId;
        const tally = s.propertyData["/camera/tallyStatus"]?.status;
        const rec = s.propertyData["/transports/0/record"]?.recording;
        const dot =
          s.conn !== "connected"
            ? "var(--color-muted)"
            : tally === "Program" || rec
              ? "var(--color-accent)"
              : tally === "Preview"
                ? "var(--color-good)"
                : "var(--color-muted)";
        return (
          <div
            key={id}
            onClick={() => switchTo(id)}
            className={`group flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg cursor-pointer border transition ${
              active
                ? "bg-[var(--color-panel)] border-[var(--color-accent-2)]"
                : "bg-[var(--color-panel-2)] border-[var(--color-edge)] hover:border-[var(--color-muted)]"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${tally === "Program" || rec ? "tally-live" : ""}`}
              style={{ background: dot }}
            />
            <span className="text-xs max-w-[150px] truncate">{s.device.productName || s.label}</span>
            {s.conn === "connecting" && <span className="text-[10px] text-[var(--color-muted)]">…</span>}
            <button
              title={t("tab.close")}
              aria-label={t("tab.close")}
              onClick={(e) => {
                e.stopPropagation();
                close(id);
              }}
              className="text-[var(--color-muted)] hover:text-[var(--color-accent)] text-xs px-0.5"
            >
              ✕
            </button>
          </div>
        );
      })}

      {order.length > 1 && (
        <button
          onClick={copy}
          className="ml-1 px-2.5 py-1.5 text-xs rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] hover:border-[var(--color-accent-2)] transition"
        >
          ⎘ {t("tab.copyLook")}
        </button>
      )}
      {msg && <span className="text-xs text-[var(--color-good)]">{msg}</span>}
    </div>
  );
}
