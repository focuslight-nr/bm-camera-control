import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauriTransport";

export interface Discovered {
  host: string;
  productName: string;
  deviceName: string;
}

/** Scan the local network for cameras. Browser/mock returns an empty list. */
export async function discoverCameras(): Promise<Discovered[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<Discovered[]>("discover_cameras", { subnet: null });
  } catch {
    return [];
  }
}
