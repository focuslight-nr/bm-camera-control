import type { Json } from "../types";

/** A mock camera: identity + which properties it exposes + initial state. */
export interface MockProfile {
  id: string;
  label: string;
  device: { deviceName: string; productName: string; softwareVersion: string };
  /** REST GET payloads keyed by path. PUTs mutate clones of these. */
  state: Record<string, Json>;
  /** Subset of `state` keys this model advertises via listProperties. */
  available: string[];
}

const MON_TOOLS = ["zebra", "falseColor", "focusAssist", "displayLUT", "cleanFeed", "frameGrids", "safeArea"];
/** Build /monitoring/{name}/{tool} = { enabled } entries for a display. */
function perDisplay(name: string, on: Record<string, boolean> = {}): Record<string, Json> {
  return Object.fromEntries(MON_TOOLS.map((t) => [`/monitoring/${name}/${t}`, { enabled: !!on[t] }]));
}
/** Capability keys for a display's monitoring tools. */
function monKeys(name: string): string[] {
  return MON_TOOLS.map((t) => `/monitoring/${name}/${t}`);
}

// Property payloads shaped to mirror the real REST API responses.
const commonState: Record<string, Json> = {
  "/transports/0/record": { recording: false },
  "/transports/0/playback": { type: "Play", loop: false, singleClip: false, speed: 0, position: 0 },
  "/transports/0/timecode": { display: "01:00:00:00", timeline: "00:00:00:00" },
  "/lens/iris": { apertureStop: 2.8, normalised: 0.4, apertureNumber: 28, continuousApertureAutoExposure: false },
  "/lens/focus": { normalised: 0.5 },
  "/lens/zoom": { normalised: 0.0, focalLength: 24 },
  "/video/iso": { iso: 400 },
  "/video/gain": { gain: 0 },
  "/video/whiteBalance": { whiteBalance: 5600 },
  "/video/whiteBalanceTint": { whiteBalanceTint: 0 },
  "/video/ndFilter": { stop: 0 },
  "/video/shutter": { shutterSpeed: 50, shutterAngle: 180 },
  "/video/autoExposure": { mode: "Off", type: "Iris" },
  "/video/detailSharpening": { enabled: true },
  "/video/detailSharpeningLevel": { level: "Low" },
  "/colorCorrection/lift": { red: 0, green: 0, blue: 0, luma: 0 },
  "/colorCorrection/gamma": { red: 0, green: 0, blue: 0, luma: 0 },
  "/colorCorrection/gain": { red: 1, green: 1, blue: 1, luma: 1 },
  "/colorCorrection/offset": { red: 0, green: 0, blue: 0, luma: 0 },
  "/colorCorrection/contrast": { pivot: 0.5, adjust: 1 },
  "/colorCorrection/color": { hue: 0, saturation: 1 },
  "/colorCorrection/lumaContribution": { lumaContribution: 1 },
  "/monitoring/focusAssist": { mode: "Peak", color: "White", intensity: 0.5 },
  "/monitoring/frameGuideRatio": { ratio: "2.39:1" },
  "/monitoring/safeAreaPercent": { percent: 90 },
  "/monitoring/display": { displays: ["HDMI", "MainSDI"] },
  ...perDisplay("HDMI", { zebra: true, focusAssist: true, cleanFeed: true }),
  ...perDisplay("MainSDI", { cleanFeed: true }),
  "/audio/channel/0/level": { gain: 0, normalised: 0.75 },
  "/audio/channel/0/phantomPower": { enabled: false },
  "/audio/channel/0/input": { input: "Camera - Left" },
  "/audio/channel/0/lowCutFilter": { enabled: false },
  "/audio/channel/0/padding": { enabled: false },
  "/audio/channel/0/supportedInputs": [
    { available: true, input: "None" },
    { available: true, input: "Camera - Left" },
    { available: true, input: "Camera - Right" },
    { available: true, input: "XLR - Line" },
    { available: true, input: "XLR - Mic" },
  ],
  "/audio/channel/1/level": { gain: 0, normalised: 0.75 },
  "/audio/channel/1/phantomPower": { enabled: false },
  "/audio/channel/1/input": { input: "Camera - Right" },
  "/audio/channel/1/lowCutFilter": { enabled: false },
  "/audio/channel/1/padding": { enabled: false },
  "/audio/channel/1/supportedInputs": [
    { available: true, input: "None" },
    { available: true, input: "Camera - Left" },
    { available: true, input: "Camera - Right" },
    { available: true, input: "XLR - Line" },
    { available: true, input: "XLR - Mic" },
  ],
  "/system/codecFormat": { codec: "BRAW", container: "MOV" },
  "/system/format": {
    codec: "BRaw:8_1", frameRate: "30",
    recordResolution: { width: 3840, height: 2160 },
    resolutionDescriptor: { aspectRatio: "16:9", description: "Ultra HD", group: "4K" },
    sensorResolution: { width: 3840, height: 2160 },
  },
  "/system/supportedFormats": {
    supportedFormats: [
      {
        codecs: ["BRaw:Q0", "BRaw:Q5", "BRaw:8_1", "BRaw:12_1", "ProRes:HQ", "ProRes:422"],
        frameRates: ["23.98", "24", "25", "29.97", "30", "50", "59.94", "60"],
        recordResolution: { width: 3840, height: 2160 },
        resolutionDescriptor: { aspectRatio: "16:9", description: "Ultra HD", group: "4K" },
        sensorResolution: { width: 3840, height: 2160 },
      },
      {
        codecs: ["BRaw:Q5", "ProRes:HQ", "ProRes:422", "H.265"],
        frameRates: ["23.98", "24", "25", "30", "50", "60", "120"],
        recordResolution: { width: 1920, height: 1080 },
        resolutionDescriptor: { aspectRatio: "16:9", description: "HD", group: "HD" },
        sensorResolution: { width: 3840, height: 2160 },
      },
    ],
  },
  "/presets": { presets: ["Default", "Outdoor", "Studio"] },
  "/presets/active": { preset: "Default" },
  "/camera/tallyStatus": { status: "Off" },
  "/camera/power": { batteries: [], milliVolt: 12100, source: "AC" },
  "/camera/power/displayMode": { mode: "Percentage" },
  "/camera/colorBars": { enabled: false },
  "/camera/programFeedDisplay": { enabled: false },
  "/slates/nextClip": {
    clip: { clipName: "Next Clip", reel: 1, scene: "1", sceneLocation: "Interior", sceneTime: "Day", shotType: "None", take: 1, takeType: "None" },
    lens: { distance: "2.5m", filter: "", focalLength: "24mm", iris: "f2.8", lensType: "EF 24-70mm" },
    project: { camera: "1", cameraOperator: "", director: "", projectName: "Demo" },
  },
  "/slates/takeAutoIncrement": { enabled: true },
  "/media/slots": [{ index: 0, type: "CFexpress" }, { index: 1, type: "USB" }],
  "/media/workingset": {
    size: 2,
    workingset: [
      { volume: "Cam01", deviceName: "sd1", remainingRecordTime: 1830, totalSpace: 512_000_000_000, remainingSpace: 256_000_000_000, clipCount: 12 },
      null,
    ],
  },
  "/media/devices/doformatSupportedFilesystems": ["ExFAT", "HFS"],
  // Supported lists (REST-only) used to populate enum/range widgets.
  "/video/supportedISOs": { supportedISOs: [200, 400, 800, 1600, 3200, 6400, 12800] },
  "/video/supportedGains": { supportedGains: [-12, -6, 0, 6, 12, 18, 24, 36] },
  "/video/supportedShutters": { shutterSpeeds: [24, 30, 48, 50, 60, 100, 120, 200, 500, 1000, 2000] },
  "/video/supportedNDFilters": { ndFilters: [0, 2, 4, 6] },
  "/system/supportedCodecFormats": {
    codecs: [
      { codec: "BRAW", container: "MOV" },
      { codec: "ProRes", container: "MOV" },
      { codec: "H.265", container: "MP4" },
    ],
  },
};

function clone(s: Record<string, Json>): Record<string, Json> {
  return JSON.parse(JSON.stringify(s));
}

export const PROFILES: MockProfile[] = [
  {
    id: "studio6k",
    label: "Studio Camera 6K Pro",
    device: {
      deviceName: "studio-camera-6k-pro",
      productName: "Blackmagic Studio Camera 6K Pro",
      softwareVersion: "8.6",
    },
    state: clone(commonState),
    // No livestream-platform editing, no immersive. Has audio + monitoring.
    available: [
      "/transports/0/record", "/transports/0/playback", "/transports/0/timecode",
      "/lens/iris", "/lens/focus", "/lens/zoom",
      "/video/iso", "/video/gain", "/video/whiteBalance", "/video/whiteBalanceTint",
      "/video/ndFilter", "/video/shutter", "/video/autoExposure",
      "/colorCorrection/lift", "/colorCorrection/gamma", "/colorCorrection/gain",
      "/colorCorrection/offset", "/colorCorrection/contrast", "/colorCorrection/color",
      "/colorCorrection/lumaContribution",
      "/video/detailSharpening", "/video/detailSharpeningLevel",
      "/monitoring/focusAssist", "/monitoring/frameGuideRatio", "/monitoring/safeAreaPercent",
      "/monitoring/display", ...monKeys("HDMI"), ...monKeys("MainSDI"),
      "/audio/channel/0/input", "/audio/channel/0/level", "/audio/channel/0/phantomPower",
      "/audio/channel/0/lowCutFilter", "/audio/channel/0/padding",
      "/audio/channel/1/input", "/audio/channel/1/level", "/audio/channel/1/phantomPower",
      "/audio/channel/1/lowCutFilter", "/audio/channel/1/padding",
      "/system/codecFormat", "/system/format", "/system/supportedFormats",
      "/presets", "/presets/active",
      "/camera/tallyStatus", "/camera/power", "/camera/power/displayMode",
      "/camera/colorBars", "/camera/programFeedDisplay",
      "/slates/nextClip", "/slates/takeAutoIncrement",
      "/media/slots", "/media/workingset", "/media/devices/doformatSupportedFilesystems",
    ],
  },
  {
    id: "ursacine12k",
    label: "URSA Cine 12K LF",
    device: {
      deviceName: "ursa-cine-12k-lf",
      productName: "Blackmagic URSA Cine 12K LF",
      softwareVersion: "8.6",
    },
    state: (() => {
      const s = clone(commonState);
      s["/livestreams/0"] = { status: "Idle", bitrate: 0 };
      s["/livestreams/0/activePlatform"] = { platform: "YouTube" };
      return s;
    })(),
    available: [
      "/transports/0/record", "/transports/0/playback", "/transports/0/timecode",
      "/lens/iris", "/lens/focus", "/lens/zoom",
      "/video/iso", "/video/gain", "/video/whiteBalance", "/video/whiteBalanceTint",
      "/video/ndFilter", "/video/shutter", "/video/autoExposure",
      "/colorCorrection/lift", "/colorCorrection/gamma", "/colorCorrection/gain",
      "/colorCorrection/offset", "/colorCorrection/contrast", "/colorCorrection/color",
      "/colorCorrection/lumaContribution",
      "/video/detailSharpening", "/video/detailSharpeningLevel",
      "/monitoring/focusAssist", "/monitoring/frameGuideRatio", "/monitoring/safeAreaPercent",
      "/monitoring/display", ...monKeys("HDMI"), ...monKeys("MainSDI"),
      "/audio/channel/0/input", "/audio/channel/0/level", "/audio/channel/0/phantomPower",
      "/audio/channel/0/lowCutFilter", "/audio/channel/0/padding",
      "/audio/channel/1/input", "/audio/channel/1/level", "/audio/channel/1/phantomPower",
      "/audio/channel/1/lowCutFilter", "/audio/channel/1/padding",
      "/livestreams/0", "/livestreams/0/activePlatform",
      "/system/codecFormat", "/system/format", "/system/supportedFormats",
      "/presets", "/presets/active",
      "/camera/tallyStatus", "/camera/power", "/camera/power/displayMode",
      "/camera/colorBars", "/camera/programFeedDisplay",
      "/slates/nextClip", "/slates/takeAutoIncrement",
      "/media/slots", "/media/workingset", "/media/devices/doformatSupportedFilesystems",
    ],
  },
  {
    id: "microstudio",
    label: "Micro Studio Camera 4K G2",
    device: {
      deviceName: "micro-studio-camera-4k-g2",
      productName: "Blackmagic Micro Studio Camera 4K G2",
      softwareVersion: "8.6",
    },
    // Compact model: no ND filter, no manual focus motor, no audio phantom.
    state: (() => {
      const s = clone(commonState);
      delete s["/video/ndFilter"];
      delete s["/lens/focus"];
      return s;
    })(),
    available: [
      "/transports/0/record", "/transports/0/timecode",
      "/lens/iris", "/lens/zoom",
      "/video/iso", "/video/gain", "/video/whiteBalance", "/video/whiteBalanceTint",
      "/video/shutter", "/video/autoExposure",
      "/colorCorrection/lift", "/colorCorrection/gamma", "/colorCorrection/gain",
      "/colorCorrection/lumaContribution",
      "/monitoring/focusAssist", "/monitoring/frameGuideRatio",
      "/audio/channel/0/level",
      "/system/codecFormat", "/system/format", "/system/supportedFormats",
      "/presets", "/presets/active",
      "/camera/tallyStatus",
    ],
  },
];
