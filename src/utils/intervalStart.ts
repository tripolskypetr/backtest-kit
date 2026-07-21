import { CandleInterval } from "../interfaces/Exchange.interface";
import { intervalStepMs } from "./intervalStepMs";

/**
 * Calculates the start time of the interval containing the given timestamp.
 * @param ts - The timestamp for which to find the interval start.
 * @param interval - The candle interval.
 * @returns The start time of the interval.
 */
export const intervalStart = (ts: number, interval: CandleInterval): number => {
  const chunkMs = intervalStepMs(interval);
  return Math.floor(ts / chunkMs) * chunkMs;
};
