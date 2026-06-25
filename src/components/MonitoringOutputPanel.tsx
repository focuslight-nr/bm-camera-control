import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { useT, type StrKey } from "../i18n";

// Per-display monitoring tools (each is a simple { enabled } toggle).
const TOOLS: { key: string; label: StrKey }[] = [
  { key: "zebra", label: "monout.zebra" },
  { key: "falseColor", label: "monout.falseColor" },
  { key: "focusAssist", label: "monout.focusAssist" },
  { key: "displayLUT", label: "monout.displayLUT" },
  { key: "cleanFeed", label: "monout.cleanFeed" },
  { key: "frameGrids", label: "monout.frameGrids" },
  { key: "safeArea", label: "monout.safeArea" },
];

/** Monitoring tools for each physical output (HDMI / SDI / USB-C). */
export function MonitoringOutputPanel() {
  const available = useStore((s) => s.available);
  const propertyData = useStore((s) => s.propertyData);
  const transport = useStore((s) => s.transport);
  const write = useStore((s) => s.writeControl);
  const t = useT();

  // Discover displays from the advertised properties: /monitoring/{name}/zebra
  const displays = useMemo(() => {
    const set = new Set<string>();
    for (const p of available) {
      const m = p.match(/^\/monitoring\/([^/]+)\/zebra$/);
      if (m) set.add(m[1]);
    }
    return [...set];
  }, [available]);

  const [display, setDisplay] = useState<string>();
  const current = display && displays.includes(display) ? display : displays[0];

  // Seed the selected display's tool states (the websocket may not push them).
  useEffect(() => {
    if (!current || !transport) return;
    for (const { key } of TOOLS) {
      const path = `/monitoring/${current}/${key}`;
      if (!available.has(path) || propertyData[path] !== undefined) continue;
      transport.request("GET", path).then((res) => {
        if (res.status === 200 && res.body) {
          try {
            useStore.setState((s) => ({ propertyData: { ...s.propertyData, [path]: JSON.parse(res.body) } }));
          } catch {
            /* ignore */
          }
        }
      });
    }
  }, [current, transport, available, propertyData]);

  if (displays.length === 0) return null;

  const tools = TOOLS.filter(({ key }) => available.has(`/monitoring/${current}/${key}`));

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2 mb-1">
        <span className="text-[var(--color-accent-2)]">▤</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t("monout.title")}</h2>
      </header>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-muted)]">{t("monout.display")}</span>
        <select
          value={current}
          onChange={(e) => setDisplay(e.target.value)}
          className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1 text-sm outline-none min-w-[120px]"
        >
          {displays.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {tools.map(({ key, label }) => {
        const path = `/monitoring/${current}/${key}`;
        const enabled = !!propertyData[path]?.enabled;
        return (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--color-muted)]">{t(label)}</span>
            <button
              onClick={() => write(path, { enabled: !enabled })}
              className={`relative w-11 h-6 rounded-full transition ${enabled ? "bg-[var(--color-good)]" : "bg-[var(--color-edge)]"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
