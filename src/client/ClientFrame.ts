import { singleshot } from "functools-kit";
import {
  IFrame,
  IFrameParams,
  FrameInterval,
} from "../interfaces/Frame.interface";

/**
 * Maps FrameInterval to minutes for timestamp calculation.
 * Used to generate timeframe arrays with proper spacing.
 */
const INTERVAL_MINUTES: Record<FrameInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "12h": 720,
  "1d": 1440,
  "3d": 4320,
};

/**
 * Generates timeframe array from startDate to endDate with specified interval.
 * Uses prototype function pattern for memory efficiency.
 *
 * @param symbol - Trading pair symbol (unused, for API consistency)
 * @param self - ClientFrame instance reference
 * @returns Array of Date objects representing tick timestamps
 * @throws Error if interval is unknown
 */
const GET_TIMEFRAME_FN = async (symbol: string, self: ClientFrame) => {
  self.params.logger.debug("ClientFrame getTimeframe", {
    symbol,
  });

  const { interval, startDate, endDate } = self.params;

  const intervalMinutes = INTERVAL_MINUTES[interval];
  if (!intervalMinutes) {
    throw new Error(`ClientFrame unknown interval: ${interval}`);
  }

  const timeframes: Date[] = [];
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    timeframes.push(new Date(currentDate));
    currentDate = new Date(currentDate.getTime() + intervalMinutes * 60 * 1000);
  }

  if (self.params.callbacks?.onTimeframe) {
    self.params.callbacks.onTimeframe(timeframes, startDate, endDate, interval);
  }

  return timeframes;
};

/**
 * Client implementation for backtest timeframe generation.
 *
 * Features:
 * - Generates timestamp arrays for backtest iteration
 * - Singleshot caching prevents redundant generation
 * - Configurable interval spacing (1m to 3d)
 * - Callback support for validation and logging
 *
 * Used by BacktestLogicPrivateService to iterate through historical periods.
 */
export class ClientFrame implements IFrame {
  constructor(readonly params: IFrameParams) {}

  /**
   * Generates timeframe array for backtest period.
   * Results are cached via singleshot pattern.
   *
   * @param symbol - Trading pair symbol (unused, for API consistency)
   * @returns Promise resolving to array of Date objects
   * @throws Error if interval is invalid
   */
  public getTimeframe = singleshot(
    async (symbol: string): Promise<Date[]> =>
      await GET_TIMEFRAME_FN(symbol, this)
  );
}

export default ClientFrame;
