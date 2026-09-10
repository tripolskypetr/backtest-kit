import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import {
  IPublicSignalRow,
  StrategyName,
} from "../interfaces/Strategy.interface";

/**
 * Contract for worst peak-rollback (stale) episode updates emitted by the framework.
 * This contract defines the structure of the data emitted when the worst giveback from
 * a profit peak recorded for an open position grows to a new record (see IStrategyStale).
 * It includes contextual information about the strategy, exchange, frame, and the associated signal.
 * Consumers can use this information to calibrate trailing-take distance, profit-lock level,
 * hold time and peak-staleness thresholds from live observations.
 * The backtest flag allows consumers to differentiate between live and backtest updates for appropriate handling.
 */
export interface WorstStaleContract {
  /** Trading symbol (e.g. "BTC/USDT") */
  symbol: string;
  /** Current price at the time of the worst-stale update */
  currentPrice: number;
  /** Timestamp of the worst-stale update (milliseconds since epoch) */
  timestamp: number;
  /** Strategy name for context */
  strategyName: StrategyName;
  /** Exchange name for context */
  exchangeName: ExchangeName;
  /** Frame name for context (e.g. "1m", "5m") */
  frameName: FrameName;
  /** Public signal data for the position associated with this worst-stale update (carries the episode in `worstStale`) */
  signal: IPublicSignalRow;
  /** Indicates if the update is from a backtest or live trading (true for backtest, false for live) */
  backtest: boolean;
}
