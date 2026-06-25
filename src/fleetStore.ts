import { create } from "zustand";
import type { Transport } from "./types";
import { MockTransport } from "./api/mockTransport";
import { TauriTransport } from "./api/tauriTransport";

export interface FleetCam {
  id: string; // host, or "mock:<profile>"
  label: string;
  useMock: boolean;
  mockProfile?: string;
  host?: string;
  secure?: boolean;
  // live status
  device?: string;
  tally?: string; // "Program" | "Preview" | ...
  recording?: boolean;
  battery?: string;
  online: boolean;
}

interface FleetState {
  cameras: FleetCam[];
  add: (cam: Omit<FleetCam, "online">) => void;
  remove: (id: string) => void;
  startPolling: () => void;
  stopPolling: () => void;
  _poll: () => Promise<void>;
}

// Cache one transport per camera so polling reuses connections.
const transports = new Map<string, Transport>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function transportFor(cam: FleetCam): Transport {
  let t = transports.get(cam.id);
  if (!t) {
    t = cam.useMock
      ? new MockTransport(cam.mockProfile ?? "studio6k")
      : new TauriTransport(cam.host ?? "", cam.secure ?? false);
    transports.set(cam.id, t);
  }
  return t;
}

export const useFleet = create<FleetState>((set, get) => ({
  cameras: [],

  add: (cam) => {
    if (get().cameras.some((c) => c.id === cam.id)) return;
    set((s) => ({ cameras: [...s.cameras, { ...cam, online: false }] }));
  },

  remove: (id) => {
    transports.delete(id);
    set((s) => ({ cameras: s.cameras.filter((c) => c.id !== id) }));
  },

  startPolling: () => {
    if (pollTimer) return;
    get()._poll();
    pollTimer = setInterval(() => get()._poll(), 2500);
  },

  stopPolling: () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  },

  _poll: async () => {
    const cams = get().cameras;
    await Promise.all(
      cams.map(async (cam) => {
        const t = transportFor(cam);
        const get200 = async (p: string) => {
          const r = await t.request("GET", p);
          return r.status === 200 && r.body ? JSON.parse(r.body) : null;
        };
        try {
          const [prod, tally, rec, power] = await Promise.all([
            cam.device ? Promise.resolve(null) : get200("/system/product"),
            get200("/camera/tallyStatus"),
            get200("/transports/0/record"),
            get200("/camera/power"),
          ]);
          set((s) => ({
            cameras: s.cameras.map((c) =>
              c.id !== cam.id
                ? c
                : {
                    ...c,
                    online: true,
                    device: prod?.productName ?? c.device,
                    tally: tally?.status ?? c.tally,
                    recording: rec?.recording ?? c.recording,
                    battery: power ? fmtPower(power) : c.battery,
                  },
            ),
          }));
        } catch {
          set((s) => ({ cameras: s.cameras.map((c) => (c.id === cam.id ? { ...c, online: false } : c)) }));
        }
      }),
    );
  },
}));

function fmtPower(p: any): string {
  if (p?.batteryPercentage != null) return `${p.batteryPercentage}%`;
  if (p?.batteries?.[0]?.percentage != null) return `${p.batteries[0].percentage}%`;
  if (p?.milliVolt != null) return `${(p.milliVolt / 1000).toFixed(1)}V`;
  return "—";
}
