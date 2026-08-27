import { create } from "zustand";
import { Kernel, type Snapshot, type Params } from "@/lib/kernel/kernel";
import { WORLD_META, type WorldKind } from "@/lib/kernel/presets";

export type ViewId = "lab" | "laws" | "loop";
export type PaintMode = "none" | "wall" | "food" | "erase";

type LabState = {
  ready: boolean;
  running: boolean;
  speed: number;
  view: ViewId;
  paint: PaintMode;
  intro: boolean;
  params: Params;
  worldKind: WorldKind;
  snap: Snapshot | null;
  boot: () => void;
  play: (on?: boolean) => void;
  setSpeed: (n: number) => void;
  setView: (v: ViewId) => void;
  setPaint: (p: PaintMode) => void;
  setParam: <K extends keyof Params>(k: K, v: Params[K]) => void;
  setWorld: (k: WorldKind) => void;
  resetBrain: () => void;
  resetWorld: () => void;
  stepOnce: () => void;
  paintAt: (x: number, y: number) => void;
  dismissIntro: () => void;
};

let kernel: Kernel | null = null;
let raf = 0;
let acc = 0;
let last = 0;
let lastPush = 0;
let loopOn = false;
let unsubPush: ((s: Snapshot) => void) | null = null;

function push() {
  if (!kernel || !unsubPush) return;
  unsubPush(kernel.snapshot());
}

function loop(ts: number) {
  raf = requestAnimationFrame(loop);
  const st = useLab.getState();
  if (!st.running || !kernel) {
    last = ts;
    return;
  }
  const dt = Math.min(100, ts - last);
  last = ts;
  acc += dt;
  const interval = 1000 / st.speed;
  let steps = 0;
  while (acc >= interval && steps < 24) {
    kernel.step();
    acc -= interval;
    steps++;
  }
  if (steps && ts - lastPush > 70) {
    lastPush = ts;
    push();
  }
}

export const useLab = create<LabState>((set, get) => ({
  ready: false,
  running: true,
  speed: 10,
  view: "lab",
  paint: "none",
  intro: true,
  params: { lr: 0.035, curiosity: 1, goal: 1, temperature: 0.45 },
  worldKind: "field",
  snap: null,
  boot: () => {
    if (kernel) return;
    const seen = typeof window !== "undefined" && localStorage.getItem("kernel-intro") === "1";
    kernel = new Kernel("field", (Math.random() * 1e9) | 0);
    kernel.params = { ...get().params };
    unsubPush = (snap) => set({ snap });
    set({ ready: true, intro: !seen, snap: kernel.snapshot() });
    if (!loopOn) {
      loopOn = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  },
  play: (on) => {
    const running = on ?? !get().running;
    acc = 0;
    last = performance.now();
    set({ running });
  },
  setSpeed: (n) => set({ speed: n }),
  setView: (view) => set({ view }),
  setPaint: (paint) => set({ paint: get().paint === paint ? "none" : paint }),
  setParam: (k, v) => {
    const params = { ...get().params, [k]: v };
    if (kernel) kernel.params = params;
    set({ params });
  },
  setWorld: (worldKind) => {
    if (!kernel) return;
    kernel.rebuildWorld(worldKind);
    set({ worldKind, snap: kernel.snapshot(), paint: "none" });
  },
  resetBrain: () => {
    if (!kernel) return;
    kernel.resetBrain();
    set({ snap: kernel.snapshot() });
  },
  resetWorld: () => {
    if (!kernel) return;
    kernel.rebuildWorld(get().worldKind);
    set({ snap: kernel.snapshot() });
  },
  stepOnce: () => {
    if (!kernel) return;
    kernel.step();
    push();
  },
  paintAt: (x, y) => {
    if (!kernel) return;
    const mode = get().paint;
    if (mode === "none") return;
    kernel.paint(x, y, mode);
    push();
  },
  dismissIntro: () => {
    try {
      localStorage.setItem("kernel-intro", "1");
    } catch {
      /* ignore */
    }
    set({ intro: false });
  },
}));

export { WORLD_META };
