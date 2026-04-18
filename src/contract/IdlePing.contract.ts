import { FrameName } from "../interfaces/Frame.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for idle ping events when no signal is active.
 *
 * Emitted by idlePingSubject every tick/minute when there is no pending
 * or scheduled signal being monitored.
 * Used for tracking idle strategy lifecycle.
 *
 * Consumers:
 * - User callbacks via listenIdlePing() / listenIdlePingOnce()
 */
export interface IdlePingContract {
  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   */
  symbol: string;

  /**
   * Strategy name that is in idle state.
   */
  strategyName: StrategyName;

  /**
   * Exchange name where this strategy is running.
   */
  exchangeName: ExchangeName;

  /**
   * Frame name (if backtest)
   */
  frameName: FrameName;

  /**
   * Current market price of the symbol at the time of the ping.
   */
  currentPrice: number;

  /**
   * Execution mode flag.
   * - true: Event from backtest execution (historical candle data)
   * - false: Event from live trading (real-time tick)
   */
  backtest: boolean;

  /**
   * Event timestamp in milliseconds since Unix epoch.
   *
   * Timing semantics:
   * - Live mode: when.getTime() at the moment of ping
   * - Backtest mode: candle.timestamp of the candle being processed
   */
  timestamp: number;
}

export default IdlePingContract;
