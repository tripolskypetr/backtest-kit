import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for strategy pause state changes emitted by the framework.
 * Emitted when setPaused toggles the pause flag of a strategy: while paused the
 * strategy opens nothing new (params.getSignal is not called, a queued createSignal
 * DTO is held); an existing pending/scheduled signal keeps being monitored and
 * closes normally.
 * Consumers can use this event to generate user-facing notifications (e.g. Telegram)
 * about the pause/resume of automatic trading.
 * The backtest flag allows consumers to differentiate between live and backtest
 * updates for appropriate handling.
 */
export interface PauseContract {
  /** Trading symbol (e.g. "BTC/USDT") */
  symbol: string;
  /** New pause state: true — generation suspended, false — resumed */
  paused: boolean;
  /** Timestamp of the pause state change (milliseconds since epoch) */
  timestamp: number;
  /** Strategy name for context */
  strategyName: StrategyName;
  /** Exchange name for context */
  exchangeName: ExchangeName;
  /** Frame name for context (e.g. "1m", "5m") */
  frameName: FrameName;
  /** Indicates if the update is from a backtest or live trading (true for backtest, false for live) */
  backtest: boolean;
}

export default PauseContract;
