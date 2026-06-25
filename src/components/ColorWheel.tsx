import { useRef } from "react";

interface RGBL {
  red: number;
  green: number;
  blue: number;
  luma: number;
}

// Channel directions on the wheel (degrees), evenly spaced.
const DIRS = { red: 90, green: 210, blue: 330 } as const;
const D2R = Math.PI / 180;

interface Props {
  label: string;
  value: RGBL;
  base: number; // 0 for lift/gamma/offset, 1 for gain
  range: number; // chroma magnitude scale
  onChange: (v: RGBL) => void;
  disabled?: boolean;
}

/** A DaVinci-style color trackball: 2D chroma puck + vertical luma fader. */
export function ColorWheel({ label, value, base, range, onChange, disabled }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const R = 54; // wheel radius in svg units
  const cx = 64;
  const cy = 64;

  // Recover puck position from current channel offsets.
  let px = 0;
  let py = 0;
  for (const ch of ["red", "green", "blue"] as const) {
    const off = (value[ch] ?? base) - base;
    px += off * Math.cos(DIRS[ch] * D2R);
    py += off * Math.sin(DIRS[ch] * D2R);
  }
  // scale to wheel; (2/3) inverts the 3-phase projection
  const sx = (px * (2 / 3) * R) / range;
  const sy = (py * (2 / 3) * R) / range;
  const puckX = cx + clamp(sx, -R, R);
  const puckY = cy - clamp(sy, -R, R); // svg y is down

  function fromEvent(e: React.PointerEvent) {
    const svg = ref.current!;
    const rect = svg.getBoundingClientRect();
    const scale = 128 / rect.width;
    let dx = (e.clientX - rect.left) * scale - cx;
    let dy = -((e.clientY - rect.top) * scale - cy);
    const r = Math.hypot(dx, dy);
    if (r > R) {
      dx = (dx / r) * R;
      dy = (dy / r) * R;
    }
    const angle = Math.atan2(dy, dx);
    const mag = (Math.min(r, R) / R) * range;
    const next: RGBL = { ...value };
    for (const ch of ["red", "green", "blue"] as const) {
      next[ch] = round(base + mag * Math.cos(angle - DIRS[ch] * D2R));
    }
    onChange(next);
  }

  function onLuma(v: number) {
    onChange({ ...value, luma: v });
  }

  function reset() {
    onChange({ red: base, green: base, blue: base, luma: base });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">{label}</div>
      <div className="flex items-end gap-2">
        <svg
          ref={ref}
          viewBox="0 0 128 128"
          className={`w-28 h-28 touch-none ${disabled ? "opacity-40" : "cursor-crosshair"}`}
          onPointerDown={(e) => {
            if (disabled) return;
            (e.target as Element).setPointerCapture(e.pointerId);
            fromEvent(e);
          }}
          onPointerMove={(e) => {
            if (disabled || e.buttons !== 1) return;
            fromEvent(e);
          }}
          onDoubleClick={() => !disabled && reset()}
        >
          <defs>
            <radialGradient id={`g-${label}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1b212c" />
              <stop offset="100%" stopColor="#0b0e13" />
            </radialGradient>
          </defs>
          {/* hue ring */}
          <circle cx={cx} cy={cy} r={R} fill={`url(#g-${label})`} stroke="var(--color-edge)" strokeWidth="1" />
          {[0, 60, 120, 180, 240, 300].map((a) => {
            const x2 = cx + R * Math.cos(a * D2R);
            const y2 = cy - R * Math.sin(a * D2R);
            return <line key={a} x1={cx} y1={cy} x2={x2} y2={y2} stroke="var(--color-edge)" strokeWidth="0.5" opacity="0.5" />;
          })}
          <circle cx={cx} cy={cy} r="2" fill="var(--color-muted)" />
          <circle cx={puckX} cy={puckY} r="6" fill="var(--color-accent-2)" stroke="#fff" strokeWidth="1" />
        </svg>
        {/* luma fader */}
        <input
          type="range"
          min={base - range}
          max={base + range}
          step={0.001}
          value={value.luma ?? base}
          disabled={disabled}
          onChange={(e) => onLuma(round(Number(e.target.value)))}
          // vertical
          style={{ writingMode: "vertical-lr" as any, direction: "rtl", height: 96, width: 16 }}
        />
      </div>
      <div className="text-[10px] text-[var(--color-muted)] tabular-nums">
        R{fmt(value.red, base)} G{fmt(value.green, base)} B{fmt(value.blue, base)} Y{fmt(value.luma, base)}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function round(v: number) {
  return Math.round(v * 1000) / 1000;
}
function fmt(v: number | undefined, base: number) {
  const d = (v ?? base) - base;
  return (d >= 0 ? "+" : "") + d.toFixed(2);
}
