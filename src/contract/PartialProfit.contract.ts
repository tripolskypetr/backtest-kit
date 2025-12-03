import { ISignalRow } from "../interfaces/Strategy.interface";
import { PartialLevel } from "../interfaces/Partial.interface";

/**
 * Contract for partial profit level events.
 *
 * Emitted when a signal reaches a profit level milestone (10%, 20%, etc).
 * Used for tracking partial take-profit execution.
 *
 * @example
 * ```typescript
 * import { listenPartialProfit } from "backtest-kit";
 *
 * listenPartialProfit((event) => {
 *   console.log(`Signal ${event.data.id} reached ${event.level}% profit`);
 * });
 * ```
 */
export interface PartialProfitContract {
  /** symbol - Trading symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** data - Signal row data */
  data: ISignalRow;
  /** currentPrice - Current market price */
  currentPrice: number;
  /** level - Profit level reached (10, 20, 30, etc) */
  level: PartialLevel;
  /** backtest - True if backtest mode, false if live mode */
  backtest: boolean;
  /** timestamp - Event timestamp in milliseconds (current time for live, candle time for backtest) */
  timestamp: number;
}

export default PartialProfitContract;
