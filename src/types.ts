// Shared types for the camera control app.

export type Json = any;

export interface HttpResult {
  status: number;
  body: string;
  error?: string | null;
}

export interface DeviceInfo {
  deviceName?: string;
  productName?: string;
  softwareVersion?: string;
}

/** A live transport: either the real camera (via Tauri/Rust) or the mock. */
export interface Transport {
  readonly kind: "tauri" | "mock";
  request(method: string, path: string, body?: Json): Promise<HttpResult>;
  /** Open the notification websocket. `onEvent` receives parsed JSON messages. */
  connectEvents(
    onEvent: (msg: Json) => void,
    onStatus: (status: string) => void,
  ): Promise<void>;
  send(text: string): Promise<void>;
  disconnect(): Promise<void>;
}

export type WidgetKind =
  | "slider"
  | "enum"
  | "toggle"
  | "button"
  | "numeric"
  | "text"
  | "readout"
  | "colorwheel"
  | "record"
  | "wbpresets"
  | "action";

export type PanelGroup =
  | "transport"
  | "lens"
  | "exposure"
  | "whitebalance"
  | "color"
  | "monitoring"
  | "audio"
  | "livestream"
  | "system"
  | "presets"
  | "camera"
  | "slate"
  | "media";

/** Declarative description of one control bound to an API property. */
export interface ControlDef {
  id: string;
  label: string;
  group: PanelGroup;
  widget: WidgetKind;
  /** Property key as reported by `listProperties` / used in propertyData. */
  property: string;
  /** REST path for writes (defaults to `property`). */
  path?: string;
  /** Property used for capability gating, if different from `property`
   * (e.g. an action endpoint gated on its parent property). */
  gateOn?: string;
  /** Extract the widget value from the stored property payload. */
  read?: (data: Json) => any;
  /** Build the PUT body from a widget value. */
  write?: (value: any) => Json;
  /** Static numeric range for sliders/numerics. */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Static enum options. */
  options?: { label: string; value: any }[];
  /** REST path to fetch dynamic options/range from (e.g. /video/supportedISOs). */
  optionsFrom?: string;
  /** Pick the option array out of the optionsFrom payload. */
  optionsSelect?: (data: Json) => { label: string; value: any }[];
  /** Optional help text. */
  hint?: string;
}

export interface CameraCapabilities {
  device: DeviceInfo;
  /** Properties this specific camera supports (from listProperties). */
  available: Set<string>;
  /** Subscribable events (from /event/list). */
  events: string[];
}
