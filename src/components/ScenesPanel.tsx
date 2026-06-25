import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { applyConfig, buildConfig, deleteScene, listScenes, saveScene, type SavedScene } from "../config";

/** Quick in-app named look scenes, stored in localStorage for one-tap recall. */
export function ScenesPanel() {
  const conn = useStore((s) => s.conn);
  const t = useT();
  const [scenes, setScenes] = useState<SavedScene[]>(() => listScenes());
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (conn !== "connected") return null;

  function save() {
    const n = name.trim();
    if (!n) return;
    const { propertyData, device } = useStore.getState();
    setScenes(saveScene(n, buildConfig(propertyData, device)));
    setName("");
  }

  async function apply(scene: SavedScene) {
    const { available, writeControl } = useStore.getState();
    const res = await applyConfig(scene.config, available, writeControl);
    setMsg(`${scene.name}: ${res.applied}✓ ${res.skipped}–`);
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2 mb-1">
        <span className="text-[var(--color-accent-2)]">★</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t("scenes.title")}</h2>
        {msg && <span className="text-[10px] text-[var(--color-good)] ml-auto">{msg}</span>}
      </header>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={t("scenes.namePlaceholder")}
          className="flex-1 bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1 text-sm outline-none focus:border-[var(--color-accent-2)]"
        />
        <button
          onClick={save}
          disabled={!name.trim()}
          className="px-3 rounded-lg bg-[var(--color-accent-2)] text-black text-xs font-medium disabled:opacity-40"
        >
          {t("scenes.saveCurrent")}
        </button>
      </div>

      {scenes.length === 0 ? (
        <span className="text-xs text-[var(--color-muted)]">{t("scenes.empty")}</span>
      ) : (
        <div className="flex flex-col gap-1.5">
          {scenes.map((s) => (
            <div key={s.name} className="flex items-center gap-2 rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] px-2 py-1.5">
              <span className="text-sm flex-1 truncate">{s.name}</span>
              <button
                onClick={() => apply(s)}
                className="text-xs px-2 py-0.5 rounded-md border border-[var(--color-edge)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-accent-2)] transition"
              >
                {t("scenes.apply")}
              </button>
              <button
                onClick={() => setScenes(deleteScene(s.name))}
                className="text-xs px-1.5 py-0.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-accent)] transition"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
