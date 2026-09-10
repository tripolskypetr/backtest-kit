import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { IPublicSignalRow, StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for max drawdown updates emitted by the framework.
 * This contract defines the structure of the data emitted when a new maximum drawdown is reached for an open position.
 * It includes contextual information about the strategy, exchange, frame, and the associated signal.
 * Consumers can use this information to implement custom logic based on drawdown milestones (e.g. dynamic stop-loss adjustments, risk management).
 * The backtest flag allows consumers to differentiate between live and backtest updates for appropriate handling.
 * Max drawdown events are crucial for monitoring and managing risk, as they indicate the largest peak-to-trough decline in the position's value.
 * By tracking max drawdown, traders can make informed decisions to protect capital and optimize position management strategies.
 * The framework emits max drawdown updates whenever a new drawdown level is reached, allowing consumers to react in real-time to changing market conditions and position performance.
 */
export interface MaxDrawdownContract {
    /** Trading symbol (e.g. "BTC/USDT") */
    symbol: string;
    /** Current price at the time of the max drawdown update */
    currentPrice: number;
    /** Timestamp of the max drawdown update (milliseconds since epoch) */
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
    /** Public signal data for the position associated with this max drawdown update */
    signal: IPublicSignalRow;
    /** Indicates if the update is from a backtest or live trading (true for backtest, false for live) */
    backtest: boolean;
}
