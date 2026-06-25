import { useEffect, useRef, useState } from "react";
import type { ControlDef } from "../types";
import { useStore } from "../store";
import { ColorWheel } from "./ColorWheel";

const WB_PRESETS: { label: string; wb: number; tint: number }[] = [
  { label: "Sunlight", wb: 5600, tint: 10 },
  { label: "Tungsten", wb: 3200, tint: 0 },
  { label: "Fluoro", wb: 4000, tint: 15 },
  { label: "Shade", wb: 4500, tint: 15 },
  { label: "Cloudy", wb: 6500, tint: 10 },
];

export function ControlRenderer({ c }: { c: ControlDef }) {
  const data = useStore((s) => s.propertyData[c.property]);
  const write = useStore((s) => s.writeControl);
  const path = c.path ?? c.property;
  const value = c.read ? c.read(data) : data;

  switch (c.widget) {
    case "record":
      return <RecordButton recording={!!value} onToggle={() => write(path, c.write!(!value))} />;
    case "toggle":
      return (
        <Row label={c.label}>
          <Toggle checked={!!value} onChange={(v) => write(path, c.write!(v))} />
        </Row>
      );
    case "slider":
      return <Slider c={c} value={Number(value ?? c.min ?? 0)} onChange={(v) => write(path, c.write!(v))} />;
    case "enum":
      return <EnumControl c={c} value={value} onChange={(v) => write(path, c.write!(v))} />;
    case "readout":
      return (
        <Row label={c.label}>
          <span className="tabular-nums text-[var(--color-ink)]">{String(value ?? "—")}</span>
        </Row>
      );
    case "text":
      return <TextControl c={c} value={value ?? ""} onCommit={(v) => write(path, c.write!(v))} />;
    case "colorwheel": {
      const base = c.property.endsWith("/gain") ? 1 : 0;
      const range = base === 1 ? 0.5 : 0.2;
      return (
        <ColorWheel
          label={c.label}
          value={value}
          base={base}
          range={range}
          onChange={(v) => write(path, c.write!(v))}
        />
      );
    }
    case "wbpresets":
      return <WbPresets />;
    case "action":
      return (
        <button
          onClick={() => write(path, c.write ? c.write(undefined) : {})}
          className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] hover:border-[var(--color-accent-2)] hover:text-[var(--color-accent-2)] transition"
        >
          {c.label}
        </button>
      );
    default:
      return null;
  }
}

function RecordButton({ recording, onToggle }: { recording: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center justify-center gap-2 w-full rounded-xl py-3 font-semibold transition ${
        recording
          ? "bg-[var(--color-accent)] text-white glow-rec"
          : "bg-[var(--color-panel-2)] text-[var(--color-ink)] border border-[var(--color-edge)] hover:border-[var(--color-accent)]"
      }`}
    >
      <span className={`inline-block w-3 h-3 rounded-full ${recording ? "bg-white tally-live" : "bg-[var(--color-accent)]"}`} />
      {recording ? "RECORDING" : "RECORD"}
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition ${checked ? "bg-[var(--color-good)]" : "bg-[var(--color-edge)]"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function Slider({ c, value, onChange }: { c: ControlDef; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--color-muted)]">{c.label}</span>
        <span className="tabular-nums text-[var(--color-ink)]">
          {fmtNum(value)}
          {c.unit ? ` ${c.unit}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={c.min}
        max={c.max}
        step={c.step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function EnumControl({ c, value, onChange }: { c: ControlDef; value: any; onChange: (v: any) => void }) {
  const fetchOptions = useStore((s) => s.fetchOptions);
  const optionsPayload = useStore((s) => (c.optionsFrom ? s.options[c.optionsFrom] : undefined));
  const presetsData = useStore((s) => s.propertyData["/presets"]);

  useEffect(() => {
    if (c.optionsFrom) fetchOptions(c.optionsFrom);
  }, [c.optionsFrom, fetchOptions]);

  let options = c.options ?? [];
  if (c.optionsFrom && c.optionsSelect && optionsPayload) options = c.optionsSelect(optionsPayload);
  // Special case: presets list lives in /presets
  if (c.id === "activePreset" && presetsData?.presets) {
    options = presetsData.presets.map((p: string) => ({ label: p, value: p }));
  }

  return (
    <Row label={c.label}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1 text-sm focus:border-[var(--color-accent-2)] outline-none min-w-[110px]"
      >
        {value == null && <option value="">—</option>}
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

function WbPresets() {
  const write = useStore((s) => s.writeControl);
  return (
    <div className="flex flex-wrap gap-1.5">
      {WB_PRESETS.map((p) => (
        <button
          key={p.label}
          onClick={() => {
            write("/video/whiteBalance", { whiteBalance: p.wb });
            write("/video/whiteBalanceTint", { whiteBalanceTint: p.tint });
          }}
          className="px-2.5 py-1 text-xs rounded-lg bg-[var(--color-panel-2)] border border-[var(--color-edge)] hover:border-[var(--color-accent-2)] transition"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function TextControl({
  c,
  value,
  onCommit,
}: {
  c: ControlDef;
  value: string | number;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  // Keep in sync with incoming data unless the user is editing.
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);
  return (
    <Row label={c.label}>
      <input
        value={draft}
        onFocusCapture={() => (focused.current = true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          focused.current = false;
          if (draft !== String(value)) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1 text-sm outline-none focus:border-[var(--color-accent-2)] w-[140px] text-right"
      />
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[var(--color-muted)]">{label}</span>
      {children}
    </div>
  );
}

function fmtNum(v: number) {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}
