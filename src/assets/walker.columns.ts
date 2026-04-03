import { ColumnModel } from "../model/Column.model";
import {
  IStrategyResult,
  SignalData,
} from "../model/WalkerStatistics.model";

/**
 * Column configuration for walker strategy comparison table in markdown reports.
 *
 * Defines the table structure for displaying strategy comparison results in walker backtest reports.
 * Each column specifies how to format and display aggregated strategy performance metrics.
 *
 * Used by {@link WalkerMarkdownService} to generate markdown tables showing:
 * - Strategy ranking and identification
 * - Optimization metric value (generic "Metric" column)
 * - Performance statistics (Total Signals, Win Rate, Average PNL, Total PNL)
 * - Risk metrics (Sharpe Ratio, Standard Deviation)
 *
 * @remarks
 * This configuration is used in walker reports to compare multiple strategy configurations.
 * The "Metric" column displays the value of the metric being optimized (Sharpe, PNL, etc.).
 * Strategies are automatically sorted by metric value (best performers first).
 *
 * @example
 * ```typescript
 * import { walker_strategy_columns } from "./assets/walker.columns";
 *
 * // Use with WalkerMarkdownService for strategy comparison
 * const service = new WalkerMarkdownService();
 * await service.getReport(
 *   "my-walker",
 *   "BTCUSDT",
 *   "sharpeRatio",
 *   { exchangeName: "binance", frameName: "1d" },
 *   walker_strategy_columns
 * );
 * ```
 *
 * @see {@link WalkerMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link IStrategyResult} for data structure
 */
export const walker_strategy_columns: ColumnModel<IStrategyResult>[] = [
  {
    key: "rank",
    label: "Rank",
    format: (_data, index) => `${index + 1}`,
    isVisible: () => true,
  },
  {
    key: "strategy",
    label: "Strategy",
    format: (data) => data.strategyName,
    isVisible: () => true,
  },
  {
    key: "metric",
    label: "Metric",
    format: (data) =>
      data.metricValue !== null ? data.metricValue.toFixed(2) : "N/A",
    isVisible: () => true,
  },
  {
    key: "totalSignals",
    label: "Total Signals",
    format: (data) => `${data.stats.totalSignals}`,
    isVisible: () => true,
  },
  {
    key: "winRate",
    label: "Win Rate",
    format: (data) =>
      data.stats.winRate !== null
        ? `${data.stats.winRate.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgPnl",
    label: "Avg PNL",
    format: (data) =>
      data.stats.avgPnl !== null
        ? `${data.stats.avgPnl > 0 ? "+" : ""}${data.stats.avgPnl.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "totalPnl",
    label: "Total PNL",
    format: (data) =>
      data.stats.totalPnl !== null
        ? `${data.stats.totalPnl > 0 ? "+" : ""}${data.stats.totalPnl.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "sharpeRatio",
    label: "Sharpe Ratio",
    format: (data) =>
      data.stats.sharpeRatio !== null
        ? `${data.stats.sharpeRatio.toFixed(3)}`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "stdDev",
    label: "Std Dev",
    format: (data) =>
      data.stats.stdDev !== null
        ? `${data.stats.stdDev.toFixed(3)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "firstEventTime",
    label: "First Event",
    format: (data) =>
      data.firstEventTime !== null
        ? new Date(data.firstEventTime).toISOString()
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "lastEventTime",
    label: "Last Event",
    format: (data) =>
      data.lastEventTime !== null
        ? new Date(data.lastEventTime).toISOString()
        : "N/A",
    isVisible: () => true,
  },
];

/**
 * Column configuration for walker PNL table in markdown reports.
 *
 * Defines the table structure for displaying all closed signals across all strategies in walker backtest reports.
 * Each column specifies how to format and display individual signal trade data.
 *
 * Used by {@link WalkerMarkdownService} to generate markdown tables showing:
 * - Strategy identification for each signal
 * - Signal details (signal ID, symbol, position)
 * - Trade performance (PNL percentage, close reason)
 * - Timing information (open time, close time)
 *
 * @remarks
 * This configuration aggregates all signals from all tested strategies into a single comprehensive table.
 * Useful for detailed analysis of individual trades across different strategy configurations.
 *
 * @example
 * ```typescript
 * import { walker_pnl_columns } from "./assets/walker.columns";
 *
 * // Use with WalkerMarkdownService for signal-level analysis
 * const service = new WalkerMarkdownService();
 * await service.getReport(
 *   "my-walker",
 *   "BTCUSDT",
 *   "sharpeRatio",
 *   { exchangeName: "binance", frameName: "1d" },
 *   undefined, // use default strategy columns
 *   walker_pnl_columns
 * );
 * ```
 *
 * @see {@link WalkerMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link SignalData} for data structure
 */
export const walker_pnl_columns: ColumnModel<SignalData>[] = [
  {
    key: "strategy",
    label: "Strategy",
    format: (data) => data.strategyName,
    isVisible: () => true,
  },
  {
    key: "signalId",
    label: "Signal ID",
    format: (data) => data.signalId,
    isVisible: () => true,
  },
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.symbol,
    isVisible: () => true,
  },
  {
    key: "position",
    label: "Position",
    format: (data) => data.position.toUpperCase(),
    isVisible: () => true,
  },
  {
    key: "pnl",
    label: "PNL (net)",
    format: (data) => `${data.pnl > 0 ? "+" : ""}${data.pnl.toFixed(2)}%`,
    isVisible: () => true,
  },
  {
    key: "closeReason",
    label: "Close Reason",
    format: (data) => data.closeReason,
    isVisible: () => true,
  },
  {
    key: "openTime",
    label: "Open Time",
    format: (data) => new Date(data.openTime).toISOString(),
    isVisible: () => true,
  },
  {
    key: "closeTime",
    label: "Close Time",
    format: (data) => new Date(data.closeTime).toISOString(),
    isVisible: () => true,
  },
];
