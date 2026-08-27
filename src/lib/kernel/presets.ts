export type WorldKind = "field" | "rooms" | "spiral" | "pulse" | "blank";

export const WORLD_META: Record<
  WorldKind,
  { name: string; blurb: string }
> = {
  field: {
    name: "Field",
    blurb: "Open ground, scattered food. Foraging plus curiosity.",
  },
  rooms: {
    name: "Rooms",
    blurb: "Four chambers, narrow doors. The model must learn corridors.",
  },
  spiral: {
    name: "Spiral",
    blurb: "One path in. Prediction of walls becomes a map.",
  },
  pulse: {
    name: "Pulse",
    blurb: "A single meal that teleports. Adaptation under surprise.",
  },
  blank: {
    name: "Blank",
    blurb: "No food. Pure curiosity — a scientist with no grant.",
  },
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EMPTY = 0;
const WALL = 1;
const FOOD = 2;

export function generateWorld(kind: WorldKind, size: number, seed: number): Uint8Array {
  const rand = mulberry32(seed);
  const cells = new Uint8Array(size * size);
  const at = (x: number, y: number) => y * size + x;
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) cells[at(x, y)] = v;
  };

  // Border walls — the world has an edge.
  for (let i = 0; i < size; i++) {
    set(i, 0, WALL);
    set(i, size - 1, WALL);
    set(0, i, WALL);
    set(size - 1, i, WALL);
  }

  const empties = () => {
    const e: number[] = [];
    for (let i = 0; i < cells.length; i++) if (cells[i] === EMPTY) e.push(i);
    return e;
  };
  const sprinkle = (p: number, v: number) => {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === EMPTY && rand() < p) cells[i] = v;
    }
  };

  if (kind === "field") {
    sprinkle(0.1, WALL);
    sprinkle(0.07, FOOD);
  } else if (kind === "blank") {
    sprinkle(0.08, WALL);
  } else if (kind === "pulse") {
    sprinkle(0.06, WALL);
    const e = empties();
    if (e.length) cells[e[(rand() * e.length) | 0]] = FOOD;
  } else if (kind === "rooms") {
    const mid = (size / 2) | 0;
    for (let i = 1; i < size - 1; i++) {
      set(mid, i, WALL);
      set(i, mid, WALL);
    }
    // Doors
    set(mid, 3, EMPTY);
    set(mid, size - 4, EMPTY);
    set(3, mid, EMPTY);
    set(size - 4, mid, EMPTY);
    const rooms = [
      [2, 2, mid - 2, mid - 2],
      [mid + 2, 2, size - 3, mid - 2],
      [2, mid + 2, mid - 2, size - 3],
      [mid + 2, mid + 2, size - 3, size - 3],
    ];
    for (const [x0, y0, x1, y1] of rooms) {
      const fx = x0 + 1 + ((rand() * Math.max(1, x1 - x0 - 1)) | 0);
      const fy = y0 + 1 + ((rand() * Math.max(1, y1 - y0 - 1)) | 0);
      set(fx, fy, FOOD);
      if (rand() < 0.7) {
        const fx2 = x0 + 1 + ((rand() * Math.max(1, x1 - x0 - 1)) | 0);
        const fy2 = y0 + 1 + ((rand() * Math.max(1, y1 - y0 - 1)) | 0);
        set(fx2, fy2, FOOD);
      }
    }
  } else if (kind === "spiral") {
    cells.fill(WALL);
    for (let y = 1; y < size - 1; y++) {
      if (y % 2 === 1) {
        for (let x = 1; x < size - 1; x++) set(x, y, EMPTY);
      } else {
        const open = ((y / 2) | 0) % 2 === 1 ? size - 2 : 1;
        set(open, y, EMPTY);
      }
    }
    const e = empties();
    if (e.length) {
      cells[e[e.length - 1]] = FOOD;
      if (e.length > 12) cells[e[(e.length * 0.4) | 0]] = FOOD;
    }
  }

  return cells;
}

export function randomEmpty(cells: Uint8Array, size: number, rand: () => number) {
  const e: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === 0) e.push(i);
  if (!e.length) return { x: (size / 2) | 0, y: (size / 2) | 0 };
  const i = e[(rand() * e.length) | 0];
  return { x: i % size, y: (i / size) | 0 };
}
