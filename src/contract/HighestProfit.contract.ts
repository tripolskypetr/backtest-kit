import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import {
  IPublicSignalRow,
  StrategyName,
} from "../interfaces/Strategy.interface";

/**
 * Contract for highest profit updates emitted by the framework.
 * This contract defines the structure of the data emitted when a new highest profit is achieved for an open position.
 * It includes contextual information about the strategy, exchange, frame, and the associated signal.
 * Consumers can use this information to implement custom logic based on profit milestones (e.g. trailing stops, partial profit-taking).
 * The backtest flag allows consumers to differentiate between live and backtest updates for appropriate handling.
 */
export interface HighestProfitContract {
  /** Trading symbol (e.g. "BTC/USDT") */
  symbol: string;
  /** Current price at the time of the highest profit update */
  currentPrice: number;
  /** Timestamp of the highest profit update (milliseconds since epoch) */
  timestamp: number;
  /**
   * Event time as a `Date` instance. Backtest mode: virtual execution time
   * (candle.timestamp of the processed candle); live mode: wall-clock time.
   * Always equal to `new Date(timestamp)`.
   */
  when: Date;
  /** Strategy name for context */
  strategyName: StrategyName;
  /** Exchange name for context */
  exchangeName: ExchangeName;
  /** Frame name for context (e.g. "1m", "5m") */
  frameName: FrameName;
  /** Public signal data for the position associated with this highest profit update */
  signal: IPublicSignalRow;
  /** Indicates if the update is from a backtest or live trading (true for backtest, false for live) */
  backtest: boolean;
}
