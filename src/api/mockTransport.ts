import type { HttpResult, Json, Transport } from "../types";
import { PROFILES, type MockProfile } from "../mock/profiles";

/** In-memory camera that follows the REST + websocket contract from the manual. */
export class MockTransport implements Transport {
  readonly kind = "mock" as const;
  private profile: MockProfile;
  private state: Record<string, Json>;
  private onEvent?: (msg: Json) => void;

  constructor(profileId: string) {
    this.profile = PROFILES.find((p) => p.id === profileId) ?? PROFILES[0];
    this.state = JSON.parse(JSON.stringify(this.profile.state));
  }

  async request(method: string, path: string, body?: Json): Promise<HttpResult> {
    await delay(40); // simulate network
    const m = method.toUpperCase();

    if (path === "/system/product") {
      return ok(this.profile.device);
    }
    if (path === "/event/list") {
      return ok({ events: this.profile.available });
    }
    // Two-step media format: GET returns a key, PUT erases the device.
    if (path.endsWith("/doformat")) {
      const deviceName = decodeURIComponent(path.split("/").slice(-2, -1)[0] ?? "");
      if (m === "GET") return ok({ deviceName, key: "MOCK-FORMAT-KEY" });
      if (m === "PUT") {
        const wsp = this.state["/media/workingset"];
        const dev = wsp?.workingset?.find((d: any) => d?.deviceName === deviceName);
        if (dev) {
          dev.clipCount = 0;
          dev.remainingSpace = dev.totalSpace;
          dev.volume = body?.volume ?? dev.volume;
        }
        return { status: 204, body: "", error: null };
      }
    }

    if (m === "GET") {
      if (path in this.state) return ok(this.state[path]);
      return { status: 501, body: "", error: null }; // not implemented for this model
    }

    // Action endpoints (auto white balance / auto focus) are fire-and-forget.
    if (path.endsWith("/doAuto") || path.endsWith("/doAutoFocus")) {
      return { status: 204, body: "", error: null };
    }

    if (m === "PUT" || m === "POST") {
      if (!(path in this.state) && body && typeof body === "object") {
        this.state[path] = {};
      }
      if (path in this.state) {
        this.state[path] = { ...this.state[path], ...(body ?? {}) };
        // Notify subscribers, just like a real camera.
        this.emit({
          type: "event",
          data: { action: "propertyValueChanged", property: path, value: this.state[path] },
        });
        return { status: 204, body: "", error: null };
      }
      return { status: 501, body: "", error: null };
    }

    return { status: 405, body: "", error: null };
  }

  async connectEvents(
    onEvent: (msg: Json) => void,
    onStatus: (status: string) => void,
  ): Promise<void> {
    this.onEvent = onEvent;
    await delay(30);
    onStatus("connected");
  }

  async send(text: string): Promise<void> {
    let msg: Json;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    const action = msg?.data?.action;
    if (action === "listProperties") {
      this.emit({ type: "response", data: { action: "listProperties", properties: this.profile.available } });
    } else if (action === "subscribe") {
      const props: string[] = msg.data.properties ?? [];
      const values: Record<string, Json> = {};
      for (const p of props) if (p in this.state) values[p] = this.state[p];
      this.emit({ type: "response", data: { action: "subscribe", values } });
    }
  }

  async disconnect(): Promise<void> {
    this.onEvent = undefined;
  }

  private emit(msg: Json) {
    // async to mimic websocket delivery
    setTimeout(() => this.onEvent?.(msg), 0);
  }
}

function ok(obj: Json): HttpResult {
  return { status: 200, body: JSON.stringify(obj), error: null };
}
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
