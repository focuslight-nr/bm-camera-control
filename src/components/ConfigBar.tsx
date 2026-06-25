import { useRef, useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { applyConfig, buildConfig, downloadConfig, isSceneConfig } from "../config";

/** Save the current look settings to a file, or load one to switch settings. */
export function ConfigBar() {
  const conn = useStore((s) => s.conn);
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (conn !== "connected") return null;

  function save() {
    const { propertyData, device } = useStore.getState();
    downloadConfig(buildConfig(propertyData, device));
    flash(`✓`);
  }

  async function load(file: File) {
    try {
      const cfg = JSON.parse(await file.text());
      if (!isSceneConfig(cfg)) {
        flash(`⚠ ${t("scene.loadError")}`);
        return;
      }
      const { available, writeControl } = useStore.getState();
      const res = await applyConfig(cfg, available, writeControl);
      flash(`${t("scene.applied")} ${res.applied} · ${res.skipped} ${t("scene.skipped")}`);
    } catch {
      flash(`⚠ ${t("scene.loadError")}`);
    }
  }

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 4000);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={save}
        className="px-2.5 py-1 text-xs rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] hover:border-[var(--color-accent-2)] transition"
      >
        ⭳ {t("scene.save")}
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        className="px-2.5 py-1 text-xs rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] hover:border-[var(--color-accent-2)] transition"
      >
        ⭱ {t("scene.load")}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) load(f);
          e.target.value = ""; // allow re-loading the same file
        }}
      />
      {msg && <span className="text-xs text-[var(--color-good)]">{msg}</span>}
    </div>
  );
}
