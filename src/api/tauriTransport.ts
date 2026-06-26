import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { HttpResult, Json, Transport } from "../types";

/** Talks to a real camera through the Rust backend (no CORS, accepts self-signed TLS). */
export class TauriTransport implements Transport {
  readonly kind = "tauri" as const;
  private unlisteners: UnlistenFn[] = [];

  constructor(
    private host: string,
    private secure: boolean,
    private username?: string,
    private password?: string,
  ) {}

  async request(method: string, path: string, body?: Json): Promise<HttpResult> {
    return invoke<HttpResult>("camera_request", {
      args: {
        host: this.host,
        secure: this.secure,
        method,
        path,
        body: body ?? null,
        username: this.username || null,
        password: this.password || null,
      },
    });
  }

  async connectEvents(
    onEvent: (msg: Json) => void,
    onStatus: (status: string) => void,
  ): Promise<void> {
    this.unlisteners.push(
      await listen<string>("camera-ws", (e) => {
        try {
          onEvent(JSON.parse(e.payload));
        } catch {
          /* ignore malformed frame */
        }
      }),
    );
    this.unlisteners.push(
      await listen<string>("camera-ws-status", (e) => onStatus(e.payload)),
    );
    await invoke("camera_ws_connect", {
      host: this.host,
      secure: this.secure,
      username: this.username || null,
      password: this.password || null,
    });
  }

  async send(text: string): Promise<void> {
    await invoke("camera_ws_send", { text });
  }

  async disconnect(): Promise<void> {
    for (const u of this.unlisteners) u();
    this.unlisteners = [];
    try {
      await invoke("camera_ws_disconnect");
    } catch {
      /* already gone */
    }
  }
}

/** True when running inside the Tauri shell (vs a plain browser tab). */
export function isTauri(): boolean {
  return typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
}
