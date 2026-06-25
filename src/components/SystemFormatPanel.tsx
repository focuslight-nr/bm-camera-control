import { useEffect, useState } from "react";
import { useStore } from "../store";
import { PANEL_META } from "../api/registry";
import { useT } from "../i18n";

const FORMAT = "/system/format";
const SUPPORTED = "/system/supportedFormats";

interface FmtEntry {
  codecs: string[];
  frameRates: string[];
  recordResolution: { width: number; height: number };
  resolutionDescriptor?: { description?: string; group?: string; aspectRatio?: string };
}

/** Recording format editor backed by /system/format + /system/supportedFormats. */
export function SystemFormatPanel() {
  const available = useStore((s) => s.available);
  const current = useStore((s) => s.propertyData[FORMAT]);
  const supportedPayload = useStore((s) => s.options[SUPPORTED]);
  const fetchOptions = useStore((s) => s.fetchOptions);
  const write = useStore((s) => s.writeControl);
  const t = useT();

  useEffect(() => {
    if (available.has(SUPPORTED) || available.has(FORMAT)) fetchOptions(SUPPORTED);
  }, [available, fetchOptions]);

  // Local draft, seeded from the camera's current format.
  const [resIdx, setResIdx] = useState(0);
  const [codec, setCodec] = useState<string>();
  const [frameRate, setFrameRate] = useState<string>();

  const entries: FmtEntry[] = supportedPayload?.supportedFormats ?? [];

  // Sync draft to current format once data arrives.
  useEffect(() => {
    if (!current || entries.length === 0) return;
    const idx = Math.max(
      0,
      entries.findIndex(
        (e) =>
          e.recordResolution?.width === current.recordResolution?.width &&
          e.recordResolution?.height === current.recordResolution?.height,
      ),
    );
    setResIdx(idx);
    setCodec(current.codec);
    setFrameRate(current.frameRate);
  }, [current, entries.length]);

  if (!available.has(FORMAT)) return null;
  const meta = PANEL_META.system;
  const entry = entries[resIdx];

  const dirty =
    codec !== current?.codec ||
    frameRate !== current?.frameRate ||
    entry?.recordResolution?.width !== current?.recordResolution?.width ||
    entry?.recordResolution?.height !== current?.recordResolution?.height;

  function apply() {
    if (!entry) return;
    if (!window.confirm(t("format.confirm"))) return;
    write(FORMAT, {
      codec,
      frameRate,
      recordResolution: entry.recordResolution,
    });
  }

  return (
    <section className="panel p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2 mb-1">
        <span className="text-[var(--color-accent-2)]">{meta.icon}</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t("format.recordFormat")}</h2>
      </header>

      {entries.length > 1 && (
        <Select
          label={t("format.resolution")}
          value={String(resIdx)}
          options={entries.map((e, i) => ({
            value: String(i),
            label: e.resolutionDescriptor?.description ?? `${e.recordResolution.width}×${e.recordResolution.height}`,
          }))}
          onChange={(v) => setResIdx(Number(v))}
        />
      )}
      <Select
        label={t("format.codec")}
        value={codec ?? ""}
        options={(entry?.codecs ?? []).map((c) => ({ value: c, label: c }))}
        onChange={setCodec}
      />
      <Select
        label={t("format.frameRate")}
        value={frameRate ?? ""}
        options={(entry?.frameRates ?? []).map((f) => ({ value: f, label: `${f}p` }))}
        onChange={setFrameRate}
      />

      <div className="text-[10px] text-[var(--color-muted)]">
        {entry?.resolutionDescriptor?.description} · {entry?.recordResolution?.width}×{entry?.recordResolution?.height}
      </div>

      <button
        onClick={apply}
        disabled={!dirty}
        className={`mt-1 rounded-lg py-2 text-sm font-medium transition ${
          dirty
            ? "bg-[var(--color-accent-2)] text-black hover:opacity-90"
            : "bg-[var(--color-panel-2)] text-[var(--color-muted)] border border-[var(--color-edge)] cursor-not-allowed"
        }`}
      >
        {t("format.apply")}
      </button>
    </section>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[var(--color-muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--color-panel-2)] border border-[var(--color-edge)] rounded-lg px-2 py-1 text-sm outline-none focus:border-[var(--color-accent-2)] min-w-[130px]"
      >
        {value === "" && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
