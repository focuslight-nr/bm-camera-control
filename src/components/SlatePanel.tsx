import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { PANEL_META } from "../api/registry";
import { useT } from "../i18n";

const PROP = "/slates/nextClip";
const AUTO = "/slates/takeAutoIncrement";

type Section = "clip" | "project";

/** Slate metadata editor for the next clip (scene/take/project info). */
export function SlatePanel() {
  const available = useStore((s) => s.available);
  const data = useStore((s) => s.propertyData[PROP]);
  const autoInc = useStore((s) => s.propertyData[AUTO]);
  const write = useStore((s) => s.writeControl);
  const t = useT();

  if (!available.has(PROP)) return null;

  const clip = data?.clip ?? {};
  const project = data?.project ?? {};
  const lens = data?.lens ?? {};
  const meta = PANEL_META.slate;

  // Write a single field while preserving the rest of the nested object.
  function commit(section: Section, key: string, value: string | number) {
    const base = data ?? {};
    const next = {
      clip: { ...(base.clip ?? {}) },
      project: { ...(base.project ?? {}) },
    } as any;
    next[section][key] = value;
    write(PROP, next);
  }

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2 mb-1">
        <span className="text-[var(--color-accent-2)]">{meta.icon}</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t("panel.slate")}</h2>
      </header>

      <Field label={t("slate.scene")} value={clip.scene ?? ""} onCommit={(v) => commit("clip", "scene", v)} />
      <Field label={t("slate.take")} value={clip.take ?? ""} numeric onCommit={(v) => commit("clip", "take", num(v))} />
      <Field label={t("slate.reel")} value={clip.reel ?? ""} numeric onCommit={(v) => commit("clip", "reel", num(v))} />
      <Enum
        label={t("slate.sceneTime")}
        value={clip.sceneTime ?? ""}
        options={["Day", "Night", "Dawn", "Dusk"]}
        onCommit={(v) => commit("clip", "sceneTime", v)}
      />
      <Field label={t("slate.location")} value={clip.sceneLocation ?? ""} onCommit={(v) => commit("clip", "sceneLocation", v)} />
      <Field label={t("slate.project")} value={project.projectName ?? ""} onCommit={(v) => commit("project", "projectName", v)} />
      <Field label={t("slate.director")} value={project.director ?? ""} onCommit={(v) => commit("project", "director", v)} />
      <Field label={t("slate.operator")} value={project.cameraOperator ?? ""} onCommit={(v) => commit("project", "cameraOperator", v)} />

      {available.has(AUTO) && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--color-muted)]">{t("slate.autoInc")}</span>
          <button
            onClick={() => write(AUTO, { enabled: !autoInc?.enabled })}
            className={`relative w-11 h-6 rounded-full transition ${autoInc?.enabled ? "bg-[var(--color-good)]" : "bg-[var(--color-edge)]"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${autoInc?.enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      )}

      {lens.lensType && (
        <div className="text-[10px] text-[var(--color-muted)] border-t border-[var(--color-edge)] pt-2 mt-1">
          {lens.lensType} · {lens.focalLength} · {lens.iris} · {lens.distance}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  numeric,
  onCommit,
}: {
  label: string;
  value: string | number;
  numeric?: boolean;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[var(--color-muted)]">{label}</span>
      <input
        inputMode={numeric ? "numeric" : "text"}
        value={draft}
        onFocusCapture={() => (editing.current = true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          editing.current = false;
          if (draft !== String(value)) onCommit(draft);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1 text-sm outline-none focus:border-[var(--color-accent-2)] w-[150px] text-right"
      />
    </div>
  );
}

function Enum({
  label,
  value,
  options,
  onCommit,
}: {
  label: string;
  value: string;
  options: string[];
  onCommit: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[var(--color-muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onCommit(e.target.value)}
        className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1 text-sm outline-none min-w-[110px]"
      >
        {value === "" && <option value="">—</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function num(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}
