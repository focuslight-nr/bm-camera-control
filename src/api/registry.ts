import type { ControlDef, PanelGroup } from "../types";

/**
 * Declarative registry of every control. Panels are generated from this list,
 * and a control only renders when its `property` is in the camera's advertised
 * capability set — so feature-gating is automatic and data-driven.
 */
export const CONTROLS: ControlDef[] = [
  // ---- Transport / Record ----
  {
    id: "record", label: "Record", group: "transport", widget: "record",
    property: "/transports/0/record",
    read: (d) => !!d?.recording,
    write: (v) => ({ recording: v }),
  },
  {
    id: "timecode", label: "Timecode", group: "transport", widget: "readout",
    property: "/transports/0/timecode",
    // Real cameras return { display, timeline }; manual mock used { timecode }.
    read: (d) => d?.display ?? d?.timecode ?? "--:--:--:--",
  },
  {
    id: "loop", label: "Loop playback", group: "transport", widget: "toggle",
    property: "/transports/0/playback",
    read: (d) => !!d?.loop,
    write: (v) => ({ loop: v }),
  },

  // ---- Lens ----
  {
    id: "iris", label: "Iris", group: "lens", widget: "slider",
    property: "/lens/iris", min: 0, max: 1, step: 0.01, unit: "norm",
    read: (d) => d?.normalised ?? 0,
    write: (v) => ({ normalised: v }),
    hint: "Aperture (normalised 0–1)",
  },
  {
    id: "focus", label: "Focus", group: "lens", widget: "slider",
    property: "/lens/focus", min: 0, max: 1, step: 0.005, unit: "norm",
    read: (d) => d?.normalised ?? 0,
    write: (v) => ({ normalised: v }),
  },
  {
    id: "zoom", label: "Zoom", group: "lens", widget: "slider",
    property: "/lens/zoom", min: 0, max: 1, step: 0.01, unit: "norm",
    read: (d) => d?.normalised ?? 0,
    write: (v) => ({ normalised: v }),
  },
  {
    id: "autoFocus", label: "Auto focus", group: "lens", widget: "action",
    property: "/lens/focus/doAutoFocus", gateOn: "/lens/focus",
    write: () => ({}),
  },

  // ---- Exposure ----
  {
    id: "iso", label: "ISO", group: "exposure", widget: "enum",
    property: "/video/iso",
    read: (d) => d?.iso,
    write: (v) => ({ iso: Number(v) }),
    optionsFrom: "/video/supportedISOs",
    optionsSelect: (d) => (d?.supportedISOs ?? d?.isos ?? []).map((x: number) => ({ label: String(x), value: x })),
  },
  {
    id: "gain", label: "Gain", group: "exposure", widget: "enum",
    property: "/video/gain", unit: "dB",
    read: (d) => d?.gain,
    write: (v) => ({ gain: Number(v) }),
    optionsFrom: "/video/supportedGains",
    optionsSelect: (d) => (d?.supportedGains ?? d?.gains ?? []).map((x: number) => ({ label: `${x} dB`, value: x })),
  },
  {
    id: "shutter", label: "Shutter speed", group: "exposure", widget: "enum",
    property: "/video/shutter",
    read: (d) => d?.shutterSpeed ?? d?.shutterAngle,
    write: (v) => ({ shutterSpeed: Number(v) }),
    optionsFrom: "/video/supportedShutters",
    // Camera reports shutterSpeeds and/or shutterAngles depending on measurement mode.
    optionsSelect: (d) =>
      (d?.shutterSpeeds ?? []).length
        ? d.shutterSpeeds.map((x: number) => ({ label: `1/${x}`, value: x }))
        : (d?.shutterAngles ?? []).map((x: number) => ({ label: `${x / 100}°`, value: x })),
  },
  {
    id: "nd", label: "ND filter", group: "exposure", widget: "enum",
    property: "/video/ndFilter",
    read: (d) => d?.stop,
    write: (v) => ({ stop: Number(v) }),
    optionsFrom: "/video/supportedNDFilters",
    optionsSelect: (d) => (d?.ndFilters ?? []).map((x: number) => ({ label: x === 0 ? "Clear" : `ND ${x}`, value: x })),
  },
  {
    id: "autoExposure", label: "Auto exposure", group: "exposure", widget: "enum",
    property: "/video/autoExposure",
    read: (d) => d?.mode,
    write: (v) => ({ mode: v }),
    options: [
      { label: "Off", value: "Off" },
      { label: "Continuous", value: "Continuous" },
      { label: "One Shot", value: "OneShot" },
    ],
  },
  {
    id: "sharpening", label: "Detail sharpening", group: "exposure", widget: "toggle",
    property: "/video/detailSharpening",
    read: (d) => !!d?.enabled,
    write: (v) => ({ enabled: v }),
  },
  {
    id: "sharpeningLevel", label: "Sharpening level", group: "exposure", widget: "enum",
    property: "/video/detailSharpeningLevel",
    read: (d) => d?.level,
    write: (v) => ({ level: v }),
    options: ["Low", "Medium", "High"].map((x) => ({ label: x, value: x })),
  },

  // ---- White balance ----
  {
    id: "wbpresets", label: "Presets", group: "whitebalance", widget: "wbpresets",
    property: "/video/whiteBalance",
  },
  {
    id: "autoWB", label: "Auto white balance", group: "whitebalance", widget: "action",
    property: "/video/whiteBalance/doAuto", gateOn: "/video/whiteBalance",
    write: () => ({}),
  },
  {
    id: "wb", label: "Temperature", group: "whitebalance", widget: "slider",
    property: "/video/whiteBalance", min: 2500, max: 10000, step: 50, unit: "K",
    read: (d) => d?.whiteBalance ?? 5600,
    write: (v) => ({ whiteBalance: Number(v) }),
  },
  {
    id: "tint", label: "Tint", group: "whitebalance", widget: "slider",
    property: "/video/whiteBalanceTint", min: -50, max: 50, step: 1,
    read: (d) => d?.whiteBalanceTint ?? 0,
    write: (v) => ({ whiteBalanceTint: Number(v) }),
  },

  // ---- Color correction (LGG + more) ----
  ...colorWheel("lift", "Lift", "/colorCorrection/lift"),
  ...colorWheel("gamma", "Gamma", "/colorCorrection/gamma"),
  ...colorWheel("gain", "Gain", "/colorCorrection/gain", 1),
  ...colorWheel("offset", "Offset", "/colorCorrection/offset"),
  {
    id: "ccContrast", label: "Contrast", group: "color", widget: "slider",
    property: "/colorCorrection/contrast", min: 0, max: 2, step: 0.01,
    read: (d) => d?.adjust ?? 1,
    write: (v) => ({ adjust: Number(v) }),
  },
  {
    id: "ccSaturation", label: "Saturation", group: "color", widget: "slider",
    property: "/colorCorrection/color", min: 0, max: 2, step: 0.01,
    read: (d) => d?.saturation ?? 1,
    write: (v) => ({ saturation: Number(v) }),
  },
  {
    id: "ccLuma", label: "Luma mix", group: "color", widget: "slider",
    property: "/colorCorrection/lumaContribution", min: 0, max: 1, step: 0.01,
    read: (d) => d?.lumaContribution ?? 1,
    write: (v) => ({ lumaContribution: Number(v) }),
  },

  // ---- Monitoring ----
  {
    id: "focusAssist", label: "Focus assist", group: "monitoring", widget: "readout",
    property: "/monitoring/focusAssist",
    // Global focus assist reports { mode, color, intensity } (no on/off flag).
    read: (d) => (d?.mode ? `${d.mode}${d.color ? ` · ${d.color}` : ""}` : "—"),
  },
  {
    id: "frameGuide", label: "Frame guide", group: "monitoring", widget: "enum",
    property: "/monitoring/frameGuideRatio",
    read: (d) => d?.ratio ?? d?.frameGuideRatio,
    write: (v) => ({ ratio: v }),
    options: ["Off", "2.4:1", "2.39:1", "2.35:1", "1.85:1", "16:9", "4:3", "1:1", "9:16"].map((x) => ({ label: x, value: x })),
  },
  {
    id: "safeArea", label: "Safe area", group: "monitoring", widget: "slider",
    property: "/monitoring/safeAreaPercent", min: 50, max: 100, step: 1, unit: "%",
    read: (d) => d?.percent ?? d?.safeAreaPercent ?? 90,
    write: (v) => ({ percent: Number(v) }),
  },

  // ---- Audio (per channel) ----
  ...audioChannel(0),
  ...audioChannel(1),

  // ---- Livestream ----
  {
    id: "lsStatus", label: "Status", group: "livestream", widget: "readout",
    property: "/livestreams/0",
    read: (d) => d?.status ?? (d?.error ? "N/A" : "Idle"),
  },
  {
    id: "lsPlatform", label: "Platform", group: "livestream", widget: "readout",
    property: "/livestreams/0/activePlatform",
    read: (d) => d?.platform ?? d?.name ?? "—",
  },

  // ---- System / codec ----
  {
    id: "codec", label: "Codec", group: "system", widget: "enum",
    property: "/system/codecFormat",
    read: (d) => d?.codec,
    write: (v) => ({ codec: v }),
    optionsFrom: "/system/supportedCodecFormats",
    optionsSelect: (d) => (d?.codecs ?? []).map((c: any) => ({ label: `${c.codec} (${c.container})`, value: c.codec })),
  },

  // ---- Presets ----
  {
    id: "activePreset", label: "Active preset", group: "presets", widget: "enum",
    property: "/presets/active",
    read: (d) => d?.preset,
    write: (v) => ({ preset: v }),
    // options filled at runtime from /presets
  },

  // ---- Camera status ----
  {
    id: "tally", label: "Tally", group: "camera", widget: "readout",
    property: "/camera/tallyStatus",
    // Real shape: { status: "Program" | "Preview" | ... }; mock used booleans.
    read: (d) => (d?.status ? String(d.status).toUpperCase() : d?.program ? "PROGRAM" : d?.preview ? "PREVIEW" : "—"),
  },
  {
    id: "battery", label: "Power", group: "camera", widget: "readout",
    property: "/camera/power",
    read: (d) => {
      if (d?.batteryPercentage != null) return `${d.batteryPercentage}%${d.acPresent ? " (AC)" : ""}`;
      const b = d?.batteries?.[0]?.percentage;
      const v = d?.milliVolt != null ? `${(d.milliVolt / 1000).toFixed(1)}V` : "";
      const src = d?.source ? ` (${d.source})` : "";
      return b != null ? `${b}%${src}` : v ? `${v}${src}` : "—";
    },
  },
  {
    id: "powerDisplay", label: "Power readout", group: "camera", widget: "enum",
    property: "/camera/power/displayMode",
    read: (d) => d?.mode,
    write: (v) => ({ mode: v }),
    options: ["Percentage", "Voltage"].map((x) => ({ label: x, value: x })),
  },
  {
    id: "colorBars", label: "Color bars", group: "camera", widget: "toggle",
    property: "/camera/colorBars",
    read: (d) => !!d?.enabled,
    write: (v) => ({ enabled: v }),
  },
  {
    id: "programFeed", label: "Program feed display", group: "camera", widget: "toggle",
    property: "/camera/programFeedDisplay",
    read: (d) => !!d?.enabled,
    write: (v) => ({ enabled: v }),
  },

  // ---- Immersive (URSA Cine Immersive only; gated off elsewhere) ----
  {
    id: "immersiveEye", label: "Display eye", group: "monitoring", widget: "enum",
    property: "/immersive/display/HDMI/eye",
    read: (d) => d?.eye,
    write: (v) => ({ eye: v }),
    options: ["Left", "Right", "Both"].map((x) => ({ label: x, value: x })),
  },
];

function colorWheel(id: string, label: string, property: string, lumaDefault = 0): ControlDef[] {
  return [
    {
      id: `cc-${id}`, label, group: "color", widget: "colorwheel", property,
      read: (d) => ({ red: d?.red ?? lumaDefault, green: d?.green ?? lumaDefault, blue: d?.blue ?? lumaDefault, luma: d?.luma ?? lumaDefault }),
      write: (v) => v, // {red,green,blue,luma}
    },
  ];
}

function audioChannel(i: number): ControlDef[] {
  return [
    {
      id: `audio-${i}-input`, label: `Ch ${i + 1} input`, group: "audio", widget: "enum",
      property: `/audio/channel/${i}/input`,
      read: (d) => d?.input,
      write: (v) => ({ input: v }),
      optionsFrom: `/audio/channel/${i}/supportedInputs`,
      // supportedInputs is a bare array of { input, available }.
      optionsSelect: (d) =>
        (Array.isArray(d) ? d : d?.supportedInputs ?? [])
          .filter((o: any) => o.available !== false)
          .map((o: any) => ({ label: o.input, value: o.input })),
    },
    {
      id: `audio-${i}-level`, label: `Ch ${i + 1} level`, group: "audio", widget: "slider",
      property: `/audio/channel/${i}/level`, min: 0, max: 1, step: 0.01,
      read: (d) => d?.normalised ?? 0,
      write: (v) => ({ normalised: v }),
    },
    {
      id: `audio-${i}-phantom`, label: `Ch ${i + 1} +48V`, group: "audio", widget: "toggle",
      property: `/audio/channel/${i}/phantomPower`,
      // Real shape: { enabled }; mock used { phantomPower }.
      read: (d) => !!(d?.enabled ?? d?.phantomPower),
      write: (v) => ({ enabled: v }),
    },
    {
      id: `audio-${i}-lowcut`, label: `Ch ${i + 1} low cut`, group: "audio", widget: "toggle",
      property: `/audio/channel/${i}/lowCutFilter`,
      read: (d) => !!d?.enabled,
      write: (v) => ({ enabled: v }),
    },
    {
      id: `audio-${i}-padding`, label: `Ch ${i + 1} padding`, group: "audio", widget: "toggle",
      property: `/audio/channel/${i}/padding`,
      read: (d) => !!d?.enabled,
      write: (v) => ({ enabled: v }),
    },
  ];
}

export const PANEL_META: Record<PanelGroup, { title: string; icon: string }> = {
  transport: { title: "Transport", icon: "●" },
  lens: { title: "Lens", icon: "◎" },
  exposure: { title: "Exposure", icon: "☀" },
  whitebalance: { title: "White Balance", icon: "❄" },
  color: { title: "Color", icon: "◐" },
  monitoring: { title: "Monitoring", icon: "▣" },
  audio: { title: "Audio", icon: "♪" },
  livestream: { title: "Livestream", icon: "⇡" },
  system: { title: "System / Codec", icon: "⚙" },
  presets: { title: "Presets", icon: "★" },
  camera: { title: "Status", icon: "▮" },
  slate: { title: "Slate / Metadata", icon: "▦" },
  media: { title: "Media", icon: "▤" },
};

export const PANEL_ORDER: PanelGroup[] = [
  "transport", "camera", "lens", "exposure", "whitebalance",
  "color", "monitoring", "audio", "livestream", "system", "presets",
];
