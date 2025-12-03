import { ISignalRow } from "../interfaces/Strategy.interface";
import { PartialLevel } from "../interfaces/Partial.interface";

/**
 * Contract for partial loss level events.
 *
 * Emitted when a signal reaches a loss level milestone (10%, 20%, etc).
 * Used for tracking partial stop-loss execution.
 *
 * @example
 * ```typescript
 * import { listenPartialLoss } from "backtest-kit";
 *
 * listenPartialLoss((event) => {
 *   console.log(`Signal ${event.data.id} reached ${event.level}% loss`);
 * });
 * ```
 */
export interface PartialLossContract {
  /** symbol - Trading symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** data - Signal row data */
  data: ISignalRow;
  /** currentPrice - Current market price */
  currentPrice: number;
  /** level - Loss level reached (10, 20, 30, etc) */
  level: PartialLevel;
  /** backtest - True if backtest mode, false if live mode */
  backtest: boolean;
  /** timestamp - Event timestamp in milliseconds (current time for live, candle time for backtest) */
  timestamp: number;
}

export default PartialLossContract;
