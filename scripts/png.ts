/**
 * Tiny PNG writer. Heatmaps do not need a native canvas.
 */
import { crc32, deflateSync } from "node:zlib";

export function scaleNearest(rgba: Uint8Array, width: number, height: number, factor: number) {
  const w2 = width * factor;
  const h2 = height * factor;
  const out = new Uint8Array(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) {
    const sy = (y / factor) | 0;
    for (let x = 0; x < w2; x++) {
      const sx = (x / factor) | 0;
      const from = (sy * width + sx) * 4;
      const to = (y * w2 + x) * 4;
      out[to] = rgba[from]!;
      out[to + 1] = rgba[from + 1]!;
      out[to + 2] = rgba[from + 2]!;
      out[to + 3] = rgba[from + 3]!;
    }
  }
  return { rgba: out, width: w2, height: h2 };
}

export function writePng(width: number, height: number, rgba: Uint8Array | Buffer) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`rgba length ${rgba.length} != ${width}×${height}×4`);
  }
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0, 0);
  return Buffer.concat([len, name, data, crc]);
}

/** 5×7 glyphs, 5 bits per row. */
const FONT: Record<string, number[]> = {
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [14, 17, 1, 6, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  a: [14, 17, 17, 31, 17, 17, 17],
  b: [30, 17, 17, 30, 17, 17, 30],
  c: [14, 17, 16, 16, 16, 17, 14],
  d: [30, 17, 17, 17, 17, 17, 30],
  e: [31, 16, 16, 30, 16, 16, 31],
  f: [31, 16, 16, 30, 16, 16, 16],
  g: [14, 17, 16, 23, 17, 17, 14],
  h: [17, 17, 17, 31, 17, 17, 17],
  i: [14, 4, 4, 4, 4, 4, 14],
  j: [7, 2, 2, 2, 2, 18, 12],
  k: [17, 18, 20, 24, 20, 18, 17],
  l: [16, 16, 16, 16, 16, 16, 31],
  m: [17, 27, 21, 21, 17, 17, 17],
  n: [17, 25, 21, 19, 17, 17, 17],
  o: [14, 17, 17, 17, 17, 17, 14],
  p: [30, 17, 17, 30, 16, 16, 16],
  q: [14, 17, 17, 17, 21, 18, 13],
  r: [30, 17, 17, 30, 20, 18, 17],
  s: [14, 17, 16, 14, 1, 17, 14],
  t: [31, 4, 4, 4, 4, 4, 4],
  u: [17, 17, 17, 17, 17, 17, 14],
  v: [17, 17, 17, 17, 10, 10, 4],
  w: [17, 17, 17, 21, 21, 21, 10],
  x: [17, 17, 10, 4, 10, 17, 17],
  y: [17, 17, 10, 4, 4, 4, 4],
  z: [31, 1, 2, 4, 8, 16, 31],
  ".": [0, 0, 0, 0, 0, 12, 12],
  "-": [0, 0, 0, 31, 0, 0, 0],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ":": [0, 12, 12, 0, 12, 12, 0],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "[": [30, 16, 16, 16, 16, 16, 30],
  "]": [15, 1, 1, 1, 1, 1, 15],
  ",": [0, 0, 0, 0, 12, 8, 16],
};

export function drawText(rgba: Uint8Array, width: number, x: number, y: number, text: string, rgb: [number, number, number]) {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[ch.toLowerCase()];
    if (!glyph) {
      cx += 6;
      continue;
    }
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row] ?? 0;
      for (let col = 0; col < 5; col++) {
        if (((bits >> (4 - col)) & 1) === 0) continue;
        const px = cx + col;
        const py = y + row;
        if (px < 0 || py < 0 || px >= width) continue;
        const height = rgba.length / 4 / width;
        if (py >= height) continue;
        const i = (py * width + px) * 4;
        rgba[i] = rgb[0];
        rgba[i + 1] = rgb[1];
        rgba[i + 2] = rgb[2];
        rgba[i + 3] = 255;
      }
    }
    cx += 6;
  }
}

export function fillRect(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: [number, number, number],
) {
  const height = rgba.length / 4 / width;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const px = x + xx;
      const py = y + yy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const i = (py * width + px) * 4;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
}
