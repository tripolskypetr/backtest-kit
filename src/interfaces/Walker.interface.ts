import { StrategyName } from "./Strategy.interface";
import { FrameName } from "./Frame.interface";
import { ExchangeName } from "./Exchange.interface";
import { BacktestStatistics } from "../model/BacktestStatistics.model";
import WalkerCompleteContract from "../contract/WalkerComplete.contract";

/**
 * Optimization metric for comparing strategies.
 * Higher values are always better (metric is maximized).
 */
export type WalkerMetric =
  | "sharpeRatio"           // Risk-adjusted returns (default)
  | "annualizedSharpeRatio" // Sharpe ratio × √365
  | "winRate"               // Percentage of winning trades
  | "totalPnl"              // Total profit/loss percentage
  | "certaintyRatio"        // avgWin / |avgLoss|
  | "avgPnl"                // Average PNL per trade
  | "expectedYearlyReturns"; // Estimated number of trades per year

/**
 * Walker schema registered via addWalker().
 * Defines A/B testing configuration for multiple strategies.
 */
export interface IWalkerSchema {
  /** Unique walker identifier for registration */
  walkerName: WalkerName;

  /** Optional developer note for documentation */
  note?: string;

  /** Exchange to use for backtesting all strategies */
  exchangeName: ExchangeName;

  /** Timeframe generator to use for backtesting all strategies */
  frameName: FrameName;

  /** List of strategy names to compare (must be registered via addStrategy) */
  strategies: StrategyName[];

  /** Metric to optimize (default: "sharpeRatio") */
  metric?: WalkerMetric;

  /** Optional lifecycle event callbacks */
  callbacks?: Partial<IWalkerCallbacks>;
}

/**
 * Optional lifecycle callbacks for walker events.
 * Called during strategy comparison process.
 */
export interface IWalkerCallbacks {
  /** Called when starting to test a specific strategy */
  onStrategyStart: (strategyName: StrategyName, symbol: string) => void;

  /** Called when a strategy backtest completes */
  onStrategyComplete: (
    strategyName: StrategyName,
    symbol: string,
    stats: BacktestStatistics,
    metric: number | null
  ) => void;

  /** Called when a strategy backtest fails with an error */
  onStrategyError: (
    strategyName: StrategyName,
    symbol: string,
    error: Error | unknown
  ) => void;

  /** Called when all strategies have been tested */
  onComplete: (results: IWalkerResults) => void;
}

/**
 * Result for a single strategy in the comparison.
 */
export interface IWalkerStrategyResult {
  /** Strategy name */
  strategyName: StrategyName;

  /** Backtest statistics for this strategy */
  stats: BacktestStatistics;

  /** Metric value used for comparison (null if invalid) */
  metric: number | null;

  /** Rank position (1 = best, 2 = second best, etc.) */
  rank: number;
}

/**
 * Complete walker results after comparing all strategies.
 */
export interface IWalkerResults extends WalkerCompleteContract {
  /** Symbol tested */
  symbol: string;

  /** Exchange used */
  exchangeName: ExchangeName;

  /** Walker name */
  walkerName: WalkerName;

  /** Frame used */
  frameName: FrameName;
}

/**
 * Unique walker identifier.
 */
export type WalkerName = string;
