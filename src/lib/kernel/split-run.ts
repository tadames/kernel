/**
 * Which coordinates pay the frozen picture's open-band expected-error
 * drop. The episode is the static arm of the hard contrast. Fixed channels
 * are walls, food, and the west pattern. East bits are the region-1 glow.
 * Workers import this. The sweep is not part of CI.
 */
import { runOnsetEpisode, type OnsetRequest, type OnsetResult } from "./onset-run.ts";

/** Published static open-band expected-error drop, picture minus noise, rho, seeds 1–800. */
export const STATIC_ERROR_OPEN_MEAN = -0.001979316999108708;

export const STATIC_ERROR_OPEN_LO = -0.0028004244609915775;

export const STATIC_ERROR_OPEN_HI = -0.0011655647097805223;

export const STATIC_ERROR_OPEN_N = 745;

/** Published static open-band first-window expected error. */
export const STATIC_ERR1_OPEN_MEAN = -0.004525814600662986;

export const STATIC_ERR1_OPEN_LO = -0.005387617791977257;

export const STATIC_ERR1_OPEN_HI = -0.003597459121662801;

export const STATIC_ERR1_OPEN_N = 745;

/** Published static episode-average expected-error drop. */
export const STATIC_ERROR_MEAN = -0.0061724580558256;

export const STATIC_ERROR_LO = -0.006687187184073438;

export const STATIC_ERROR_HI = -0.0056480434985241735;

export const STATIC_ERROR_N = 745;

/** Published static episode-average first-window expected error. */
export const STATIC_ERR1_MEAN = -0.012466575488684344;

export const STATIC_ERR1_LO = -0.013337748278169161;

export const STATIC_ERR1_HI = -0.011616889271880282;

export const STATIC_ERR1_N = 745;

/** Published static late-band expected-error drop. */
export const STATIC_ERROR_LATE_MEAN = -0.007069708873691787;

export const STATIC_ERROR_LATE_LO = -0.007768364536942157;

export const STATIC_ERROR_LATE_HI = -0.006360190880756727;

export const STATIC_ERROR_LATE_N = 608;

/** Published static late-band first-window expected error. */
export const STATIC_ERR1_LATE_MEAN = -0.013776565579145349;

export const STATIC_ERR1_LATE_LO = -0.014638167979622987;

export const STATIC_ERR1_LATE_HI = -0.012961941273183557;

export const STATIC_ERR1_LATE_N = 608;

/** Published static occupancy, picture minus noise, rho, seeds 1–800. */
export const STATIC_OCCUPANCY_MEAN = -0.0002687500000000011;

export const STATIC_OCCUPANCY_LO = -0.009284375000000001;

export const STATIC_OCCUPANCY_HI = 0.007987499999999986;

/** Published static rectified-progress gap. */
export const STATIC_RECT_MEAN = 0.004513361669810915;

export const STATIC_RECT_LO = 0.0038187483532355756;

export const STATIC_RECT_HI = 0.005225259265659757;

export const STATIC_RECT_N = 702;

/**
 * Frozen-picture episode with the coordinate split filled in.
 * Any other pattern code is refused. The noise arm still omits the picture.
 */
export function runSplitEpisode(req: OnsetRequest): OnsetResult {
  if (req.code != null && req.code !== "static") {
    throw new Error("the coordinate split is the frozen picture only");
  }
  return runOnsetEpisode({ ...req, code: "static", traceSplit: true });
}
