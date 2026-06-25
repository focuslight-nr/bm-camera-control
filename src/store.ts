import { create } from "zustand";
import type { DeviceInfo, Json, Transport } from "./types";
import { MockTransport } from "./api/mockTransport";
import { TauriTransport, isTauri } from "./api/tauriTransport";
import { CONTROLS } from "./api/registry";
import { buildConfig } from "./config";

export type ConnState = "disconnected" | "connecting" | "connected" | "error";

/** One live camera connection (its own websocket + state). */
export interface Session {
  id: string; // "mock:<profile>" or hostname
  label: string;
  source: { useMock: boolean; mockProfile?: string; host?: string; secure?: boolean };
  transport: Transport | null;
  conn: ConnState;
  wsStatus: string;
  device: DeviceInfo;
  available: Set<string>;
  propertyData: Record<string, Json>;
  options: Record<string, Json>;
  guardUnlocked: boolean;
}

// Paths whose changes affect the live image — guarded while a camera is on PROGRAM.
const IMAGE_GROUPS = new Set(["exposure", "whitebalance", "color", "lens"]);
const IMAGE_PATHS = new Set<string>([
  ...CONTROLS.filter((c) => IMAGE_GROUPS.has(c.group)).map((c) => c.path ?? c.property),
  "/system/format",
]);

const RECENT_KEY = "bmcc.recentHosts";
function loadRecentHosts(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

const GUARD_MESSAGE = "This camera is LIVE (PROGRAM). Apply image-affecting changes anyway?";

// Per-(session+path) write serialization, and per-session reconnect bookkeeping.
const writeChains: Record<string, Promise<void>> = {};
const reconnectTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const reconnectAttempts: Record<string, number> = {};
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emptySession(id: string, label: string, source: Session["source"]): Session {
  return {
    id, label, source,
    transport: null, conn: "connecting", wsStatus: "",
    device: {}, available: new Set(), propertyData: {}, options: {}, guardUnlocked: false,
  };
}

interface AppState {
  sessions: Record<string, Session>;
  order: string[];
  activeId: string | null;

  // Draft inputs for adding a camera.
  host: string;
  secure: boolean;
  useMock: boolean;
  mockProfile: string;

  // Global settings.
  recentHosts: string[];
  programGuard: boolean;
  autoReconnect: boolean;

  // Mirror of the active session (so existing components read top-level fields).
  transport: Transport | null;
  conn: ConnState;
  wsStatus: string;
  error: string | null;
  device: DeviceInfo;
  available: Set<string>;
  propertyData: Record<string, Json>;
  options: Record<string, Json>;
  guardUnlocked: boolean;

  setHost: (h: string) => void;
  setSecure: (s: boolean) => void;
  setUseMock: (m: boolean) => void;
  setMockProfile: (p: string) => void;
  setProgramGuard: (v: boolean) => void;

  addCamera: () => Promise<void>;
  connect: () => Promise<void>; // alias of addCamera (back-compat)
  switchTo: (id: string) => void;
  closeCamera: (id: string) => Promise<void>;
  disconnect: () => Promise<void>; // closes the active session

  writeControl: (path: string, body: Json) => Promise<void>;
  fetchOptions: (path: string) => Promise<void>;
  copyLookToOthers: () => Promise<{ applied: number; cameras: number }>;
}

export const useStore = create<AppState>((set, get) => {
  // --- internal helpers (close over set/get) ---

  /** Update one session and, if it is active, mirror its fields to the top level. */
  function patchSession(id: string, updater: (s: Session) => Partial<Session>) {
    set((st) => {
      const sess = st.sessions[id];
      if (!sess) return {};
      const next = { ...sess, ...updater(sess) };
      const sessions = { ...st.sessions, [id]: next };
      const out: Partial<AppState> = { sessions };
      if (id === st.activeId) Object.assign(out, mirror(next));
      return out;
    });
  }

  function mirror(s: Session): Partial<AppState> {
    return {
      transport: s.transport,
      conn: s.conn, wsStatus: s.wsStatus, device: s.device, available: s.available,
      propertyData: s.propertyData, options: s.options, guardUnlocked: s.guardUnlocked,
    };
  }

  /** Mirror the BM websocket contract into a session. */
  function handleMessage(id: string, msg: Json, transport: Transport) {
    const data = msg?.data;
    if (!data) return;

    if (data.action === "listProperties" && Array.isArray(data.properties)) {
      patchSession(id, () => ({ available: new Set<string>(data.properties) }));
      for (const p of data.properties) {
        transport.send(JSON.stringify({ type: "request", data: { action: "subscribe", properties: [p] } }));
      }
      seedProperties(id, transport, new Set<string>(data.properties));
      return;
    }
    if (msg.type === "response" && data.values && typeof data.values === "object") {
      patchSession(id, (s) => ({ propertyData: { ...s.propertyData, ...data.values } }));
      return;
    }
    if (data.action === "propertyValueChanged" && data.property) {
      patchSession(id, (s) => ({ propertyData: { ...s.propertyData, [data.property]: data.value } }));
      if (data.property === "/camera/tallyStatus" && data.value?.status !== "Program") {
        patchSession(id, () => ({ guardUnlocked: false }));
      }
    }
  }

  const EXTRA_SEED = [
    "/slates/nextClip", "/slates/takeAutoIncrement",
    "/media/slots", "/media/workingset", "/media/active",
    "/system/format",
  ];

  async function seedProperties(id: string, transport: Transport, available: Set<string>) {
    const props = [...new Set([...CONTROLS.map((c) => c.property), ...EXTRA_SEED])].filter((p) => available.has(p));
    await Promise.all(
      props.map(async (p) => {
        if (get().sessions[id]?.propertyData[p] !== undefined) return;
        const res = await transport.request("GET", p);
        if (res.status === 200 && res.body) {
          try {
            const value = JSON.parse(res.body);
            patchSession(id, (s) => (s.propertyData[p] !== undefined ? {} : { propertyData: { ...s.propertyData, [p]: value } }));
          } catch {
            /* ignore */
          }
        }
      }),
    );
  }

  function onWsStatus(id: string, status: string) {
    patchSession(id, () => ({ wsStatus: status }));
    const sess = get().sessions[id];
    if (status === "disconnected" && sess && sess.conn === "connected" && get().autoReconnect && !sess.source.useMock) {
      if (reconnectTimers[id] || (reconnectAttempts[id] ?? 0) >= 6) return;
      reconnectAttempts[id] = (reconnectAttempts[id] ?? 0) + 1;
      patchSession(id, () => ({ conn: "connecting", wsStatus: "reconnecting" }));
      reconnectTimers[id] = setTimeout(() => {
        delete reconnectTimers[id];
        if (get().sessions[id]) connectSession(id);
      }, Math.min(1500 * reconnectAttempts[id], 8000));
    }
  }

  /** Run the full connect handshake for an existing session entry. */
  async function connectSession(id: string) {
    const sess = get().sessions[id];
    if (!sess) return;
    const { source } = sess;
    patchSession(id, () => ({ conn: "connecting", propertyData: {}, available: new Set(), device: {}, options: {}, guardUnlocked: false }));

    const transport: Transport = source.useMock
      ? new MockTransport(source.mockProfile ?? "studio6k")
      : new TauriTransport(source.host ?? "", source.secure ?? false);

    try {
      const prod = await transport.request("GET", "/system/product");
      if (prod.error) throw new Error(prod.error);
      if (prod.status === 200 && prod.body) {
        const device = JSON.parse(prod.body) as DeviceInfo;
        patchSession(id, () => ({ device, label: device.productName || sess.label }));
      }

      await transport.connectEvents(
        (msg) => handleMessage(id, msg, transport),
        (status) => onWsStatus(id, status),
      );
      await transport.send(JSON.stringify({ type: "request", data: { action: "listProperties" } }));
      await transport.request("GET", "/event/list");

      reconnectAttempts[id] = 0;
      if (!source.useMock && source.host) {
        const h = source.host;
        const recentHosts = [h, ...get().recentHosts.filter((x) => x !== h)].slice(0, 5);
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(recentHosts));
        } catch {
          /* ignore */
        }
        set({ recentHosts });
      }
      patchSession(id, () => ({ transport, conn: "connected" }));
    } catch (e: any) {
      await transport.disconnect().catch(() => {});
      patchSession(id, () => ({ conn: "error" }));
      set({ error: String(e?.message ?? e) });
    }
  }

  /** Optimistic + serialized PUT to a specific session (no PROGRAM guard). */
  async function writeTo(id: string, path: string, body: Json) {
    const sess = get().sessions[id];
    const t = sess?.transport;
    if (!t) return;
    patchSession(id, (s) => ({ propertyData: { ...s.propertyData, [path]: { ...s.propertyData[path], ...body } } }));
    const key = `${id}|${path}`;
    const run = async () => {
      let res = await t.request("PUT", path, body);
      if (res.status === 409) {
        await delay(150);
        res = await t.request("PUT", path, body);
      }
      if (res.status >= 400 || res.error) set({ error: `PUT ${path} → ${res.status} ${res.error ?? ""}` });
      else set((s) => (s.error ? { error: null } : {}));
    };
    const prev = writeChains[key] ?? Promise.resolve();
    const next = prev.then(run, run);
    writeChains[key] = next;
    await next;
  }

  return {
    sessions: {},
    order: [],
    activeId: null,

    host: "",
    secure: true,
    useMock: !isTauri(),
    mockProfile: "studio6k",

    recentHosts: loadRecentHosts(),
    programGuard: true,
    autoReconnect: true,

    transport: null,
    conn: "disconnected",
    wsStatus: "",
    error: null,
    device: {},
    available: new Set(),
    propertyData: {},
    options: {},
    guardUnlocked: false,

    setHost: (host) => set({ host }),
    setSecure: (secure) => set({ secure }),
    setUseMock: (useMock) => set({ useMock }),
    setMockProfile: (mockProfile) => set({ mockProfile }),
    setProgramGuard: (programGuard) => set({ programGuard }),

    addCamera: async () => {
      const { useMock, host, secure, mockProfile } = get();
      const id = useMock ? `mock:${mockProfile}` : host.trim();
      if (!id) return;
      if (get().sessions[id]) {
        get().switchTo(id);
        return;
      }
      const label = useMock ? mockProfile : host.trim();
      const source = useMock ? { useMock: true, mockProfile } : { useMock: false, host: host.trim(), secure };
      set((s) => ({
        sessions: { ...s.sessions, [id]: emptySession(id, label, source) },
        order: [...s.order, id],
        activeId: id,
        error: null,
        ...mirror(emptySession(id, label, source)),
      }));
      await connectSession(id);
    },

    connect: async () => get().addCamera(),

    switchTo: (id) => {
      const sess = get().sessions[id];
      if (!sess) return;
      set({ activeId: id, ...mirror(sess) });
    },

    closeCamera: async (id) => {
      if (reconnectTimers[id]) {
        clearTimeout(reconnectTimers[id]);
        delete reconnectTimers[id];
      }
      delete reconnectAttempts[id];
      const sess = get().sessions[id];
      if (sess?.transport) await sess.transport.disconnect().catch(() => {});
      set((s) => {
        const sessions = { ...s.sessions };
        delete sessions[id];
        const order = s.order.filter((x) => x !== id);
        const activeId = s.activeId === id ? order[order.length - 1] ?? null : s.activeId;
        const active = activeId ? sessions[activeId] : null;
        return {
          sessions, order, activeId,
          ...(active
            ? mirror(active)
            : { transport: null, conn: "disconnected" as ConnState, wsStatus: "", device: {}, available: new Set(), propertyData: {}, options: {}, guardUnlocked: false }),
        };
      });
    },

    disconnect: async () => {
      const id = get().activeId;
      if (id) await get().closeCamera(id);
    },

    writeControl: async (path, body) => {
      const id = get().activeId;
      if (!id) return;
      const sess = get().sessions[id];
      if (!sess?.transport) return;
      const onProgram =
        sess.propertyData["/camera/tallyStatus"]?.status === "Program" ||
        !!sess.propertyData["/transports/0/record"]?.recording;
      if (get().programGuard && onProgram && !sess.guardUnlocked && IMAGE_PATHS.has(path)) {
        const ok = typeof window !== "undefined" && window.confirm(GUARD_MESSAGE);
        if (!ok) return;
        patchSession(id, () => ({ guardUnlocked: true }));
      }
      await writeTo(id, path, body);
    },

    fetchOptions: async (path) => {
      const id = get().activeId;
      if (!id) return;
      const sess = get().sessions[id];
      if (!sess?.transport || path in sess.options) return;
      const res = await sess.transport.request("GET", path);
      if (res.status === 200 && res.body) {
        patchSession(id, (s) => ({ options: { ...s.options, [path]: JSON.parse(res.body) } }));
      }
    },

    copyLookToOthers: async () => {
      const { activeId, sessions, order } = get();
      if (!activeId) return { applied: 0, cameras: 0 };
      const active = sessions[activeId];
      const cfg = buildConfig(active.propertyData, active.device);
      let applied = 0;
      let cameras = 0;
      for (const id of order) {
        if (id === activeId) continue;
        const sess = sessions[id];
        if (sess.conn !== "connected") continue;
        cameras++;
        for (const [path, b] of Object.entries(cfg.settings)) {
          if (sess.available.has(path)) {
            await writeTo(id, path, b);
            applied++;
          }
        }
      }
      return { applied, cameras };
    },
  };
});
