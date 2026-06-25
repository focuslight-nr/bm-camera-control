import type { PanelGroup } from "../types";
import { useStore } from "../store";
import { CONTROLS, PANEL_META } from "../api/registry";
import { ControlRenderer } from "./Controls";
import { useT } from "../i18n";

/** Renders one category panel, showing only controls the camera supports. */
export function Panel({ group }: { group: PanelGroup }) {
  const available = useStore((s) => s.available);
  const t = useT();
  const meta = PANEL_META[group];

  const controls = CONTROLS.filter((c) => c.group === group && available.has(c.gateOn ?? c.property));
  if (controls.length === 0) return null; // feature-gated away

  const wheels = controls.filter((c) => c.widget === "colorwheel");
  const rest = controls.filter((c) => c.widget !== "colorwheel");

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2 mb-1">
        <span className="text-[var(--color-accent-2)]">{meta.icon}</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase text-[var(--color-ink)]">{t(`panel.${group}`)}</h2>
      </header>

      {wheels.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 pb-2">
          {wheels.map((c) => (
            <ControlRenderer key={c.id} c={c} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {rest.map((c) => (
          <ControlRenderer key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}
