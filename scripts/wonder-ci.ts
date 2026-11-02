/**
 * Draw the preregistered wonder interval from bench/gate.json.
 * One bar: paired mean of (probe off − probe on), 95% bootstrap CI.
 * The label follows the interval. It is not a second analysis.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { drawText, fillRect, writePng } from "./png.ts";

const gate = JSON.parse(readFileSync("bench/gate.json", "utf8")) as {
  seeds?: number[];
  results: { flag: string; diff: { mean: number; lo: number; hi: number } }[];
};
const row = gate.results.find((item) => item.flag === "wonder");
if (!row) throw new Error("bench/gate.json has no wonder result");

const mean = row.diff.mean;
const lo = row.diff.lo;
const hi = row.diff.hi;
const call = lo > 0 ? "confirmed" : hi < 0 ? "refuted" : "inconclusive";

const width = 640;
const height = 200;
const rgba = new Uint8Array(width * height * 4);
fillRect(rgba, width, 0, 0, width, height, [244, 240, 230]);

const span = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(mean), 0.005);
const pad = span * 0.35;
const loV = -span - pad;
const hiV = span + pad;
const x0 = 40;
const x1 = 600;
const axis = 118;
const xOf = (v: number) => x0 + ((v - loV) / (hiV - loV)) * (x1 - x0);

fillRect(rgba, width, x0, axis, x1 - x0, 1, [40, 36, 32]);
const zero = Math.round(xOf(0));
fillRect(rgba, width, zero, 78, 1, 70, [40, 36, 32]);
drawText(rgba, width, zero - 6, 152, "0", [40, 36, 32]);

const xLo = Math.round(xOf(lo));
const xHi = Math.round(xOf(hi));
const xMean = Math.round(xOf(mean));
const left = Math.min(xLo, xHi);
const right = Math.max(xLo, xHi);
const color: [number, number, number] = call === "confirmed" ? [46, 110, 72] : call === "refuted" ? [166, 62, 42] : [90, 96, 110];
fillRect(rgba, width, left, axis - 8, Math.max(1, right - left), 16, color);
fillRect(rgba, width, xMean, axis - 16, 2, 32, [40, 36, 32]);

drawText(rgba, width, 16, 16, "wonder   probe late   off minus on", [40, 36, 32]);
const n = gate.seeds?.length ?? 0;
drawText(rgba, width, 16, 36, `seeds 1-${n}   ${call}`, [40, 36, 32]);
drawText(
  rgba,
  width,
  16,
  168,
  `mean ${mean.toFixed(4)}   [${lo.toFixed(4)}, ${hi.toFixed(4)}]`,
  [40, 36, 32],
);

mkdirSync("bench/wonder", { recursive: true });
writeFileSync("bench/wonder/wonder-ci.png", writePng(width, height, rgba));
console.log(`wrote bench/wonder/wonder-ci.png ${call}`);
