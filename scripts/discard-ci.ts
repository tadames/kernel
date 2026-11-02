/**
 * Draw the preregistered discard interval from bench/gate.json.
 * One bar: paired mean of (probe off − probe on), 95% bootstrap CI.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { drawText, fillRect, writePng } from "./png.ts";

const gate = JSON.parse(readFileSync("bench/gate.json", "utf8")) as {
  results: { flag: string; diff: { mean: number; lo: number; hi: number } }[];
};
const row = gate.results.find((item) => item.flag === "discard");
if (!row) throw new Error("bench/gate.json has no discard result");

const width = 640;
const height = 200;
const rgba = new Uint8Array(width * height * 4);
fillRect(rgba, width, 0, 0, width, height, [244, 240, 230]);

const loV = -0.04;
const hiV = 0.01;
const x0 = 40;
const x1 = 600;
const axis = 118;
const xOf = (v: number) => x0 + ((v - loV) / (hiV - loV)) * (x1 - x0);

fillRect(rgba, width, x0, axis, x1 - x0, 1, [40, 36, 32]);
const zero = Math.round(xOf(0));
fillRect(rgba, width, zero, 78, 1, 70, [40, 36, 32]);
drawText(rgba, width, zero - 6, 152, "0", [40, 36, 32]);

const xLo = Math.round(xOf(row.diff.lo));
const xHi = Math.round(xOf(row.diff.hi));
const xMean = Math.round(xOf(row.diff.mean));
fillRect(rgba, width, xLo, axis - 8, Math.max(1, xHi - xLo), 16, [166, 62, 42]);
fillRect(rgba, width, xMean, axis - 16, 2, 32, [40, 36, 32]);

drawText(rgba, width, 16, 16, "discard   probe late   off minus on", [40, 36, 32]);
drawText(rgba, width, 16, 36, "seeds 1-20   interval entirely below 0   refuted", [40, 36, 32]);
drawText(
  rgba,
  width,
  16,
  168,
  `mean ${row.diff.mean.toFixed(4)}   [${row.diff.lo.toFixed(4)}, ${row.diff.hi.toFixed(4)}]`,
  [40, 36, 32],
);

mkdirSync("bench/discard", { recursive: true });
writeFileSync("bench/discard/discard-ci.png", writePng(width, height, rgba));
console.log("wrote bench/discard/discard-ci.png");
