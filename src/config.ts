import type { Json, PanelGroup } from "./types";
import { CONTROLS } from "./api/registry";

/**
 * Scene/look configuration: export the camera's adjustable "look" settings to a
 * portable JSON file and re-apply them later (or on another camera). Physical,
 * stateful, and destructive things (transport, lens position, recording format,
 * media format) are deliberately excluded so loading a file is always safe.
 */

const SAVABLE_GROUPS: PanelGroup[] = ["exposure", "whitebalance", "color", "monitoring", "audio", "camera"];

export const CONFIG_VERSION = 1;

export interface SceneConfig {
  app: "bm-camera-control";
  version: number;
  savedAt: string;
  device?: { productName?: string; softwareVersion?: string };
  /** Map of API path -> PUT body. */
  settings: Record<string, Json>;
}

const savableControls = CONTROLS.filter((c) => !!c.write && SAVABLE_GROUPS.includes(c.group));

/** Build the settings map from the current property data. */
export function collectSettings(propertyData: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const c of savableControls) {
    const data = propertyData[c.property];
    if (data === undefined) continue;
    const value = c.read ? c.read(data) : data;
    if (value === undefined || value === null) continue;
    out[c.path ?? c.property] = c.write!(value);
  }
  return out;
}

export function buildConfig(
  propertyData: Record<string, Json>,
  device?: SceneConfig["device"],
): SceneConfig {
  return {
    app: "bm-camera-control",
    version: CONFIG_VERSION,
    savedAt: new Date().toISOString(),
    device,
    settings: collectSettings(propertyData),
  };
}

export interface ApplyResult {
  applied: number;
  skipped: number;
}

/** Apply a config to the connected camera, skipping unsupported settings. */
export async function applyConfig(
  cfg: SceneConfig,
  available: Set<string>,
  write: (path: string, body: Json) => Promise<void>,
): Promise<ApplyResult> {
  let applied = 0;
  let skipped = 0;
  await Promise.all(
    Object.entries(cfg.settings ?? {}).map(async ([path, body]) => {
      if (!available.has(path)) {
        skipped++;
        return;
      }
      await write(path, body);
      applied++;
    }),
  );
  return { applied, skipped };
}

/** Validate a parsed object is a scene config. */
export function isSceneConfig(o: any): o is SceneConfig {
  return o && o.app === "bm-camera-control" && typeof o.settings === "object";
}

/* ---- In-app named scenes (localStorage) ---- */

export interface SavedScene {
  name: string;
  savedAt: string;
  config: SceneConfig;
}

const SCENES_KEY = "bmcc.scenes";

export function listScenes(): SavedScene[] {
  try {
    const raw = localStorage.getItem(SCENES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveScene(name: string, config: SceneConfig): SavedScene[] {
  const scenes = listScenes().filter((s) => s.name !== name);
  scenes.unshift({ name, savedAt: config.savedAt, config });
  localStorage.setItem(SCENES_KEY, JSON.stringify(scenes));
  return scenes;
}

export function deleteScene(name: string): SavedScene[] {
  const scenes = listScenes().filter((s) => s.name !== name);
  localStorage.setItem(SCENES_KEY, JSON.stringify(scenes));
  return scenes;
}

/** Trigger a browser/webview download of the config as JSON. */
export function downloadConfig(cfg: SceneConfig) {
  const name = `bmcc-scene-${cfg.savedAt.replace(/[:.]/g, "-")}.json`;
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
