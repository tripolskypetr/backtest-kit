import { ColumnModel } from "../model/Column.model";
import { getPriceScale } from "../helpers/getPriceScale";
import { StrategyEvent } from "../model/StrategyStatistics.model";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Column configuration for strategy markdown reports.
 *
 * Defines the table structure for displaying strategy management events in trading reports.
 * Each column specifies how to format and display strategy actions like partial profit/loss,
 * trailing stop/take, breakeven, cancel scheduled, and close pending.
 *
 * Used by {@link StrategyMarkdownService} to generate markdown tables showing:
 * - Signal identification (symbol, strategy name, signal ID)
 * - Action information (action type, percent values, prices)
 * - Timing information (timestamp, mode: backtest or live)
 *
 * @remarks
 * This configuration tracks all strategy management events - when signals are
 * modified, cancelled, or closed during their lifecycle.
 *
 * @example
 * ```typescript
 * import { strategy_columns } from "./assets/strategy.columns";
 *
 * // Use with StrategyMarkdownService
 * const service = new StrategyMarkdownService();
 * await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false, strategy_columns);
 *
 * // Or customize to show only key fields
 * const customColumns = strategy_columns.filter(col =>
 *   ["symbol", "action", "currentPrice", "timestamp"].includes(col.key)
 * );
 * await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false, customColumns);
 * ```
 *
 * @see {@link StrategyMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link StrategyEvent} for data structure
 */
export const strategy_columns: ColumnModel<StrategyEvent>[] = [
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.symbol,
    isVisible: () => true,
  },
  {
    key: "strategyName",
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
    key: "action",
    label: "Action",
    format: (data) => data.action,
    isVisible: () => true,
  },
  {
    key: "currentPrice",
    label: "Price",
    format: (data) => (data.currentPrice !== undefined ? `${data.currentPrice.toFixed(getPriceScale(data.currentPrice))} USD` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "percentToClose",
    label: "% To Close",
    format: (data) => (data.percentToClose !== undefined ? `${data.percentToClose.toFixed(2)}%` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "percentShift",
    label: "% Shift",
    format: (data) => (data.percentShift !== undefined ? `${data.percentShift.toFixed(2)}%` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "cancelId",
    label: "Cancel ID",
    format: (data) => data.cancelId || "N/A",
    isVisible: () => true,
  },
  {
    key: "closeId",
    label: "Close ID",
    format: (data) => data.closeId || "N/A",
    isVisible: () => true,
  },
  {
    key: "createdAt",
    label: "Created At",
    format: (data) => data.createdAt || "N/A",
    isVisible: () => true,
  },
  {
    key: "totalPartials",
    label: "Partial Closes",
    format: (data) => (data.totalPartials !== undefined ? String(data.totalPartials) : "N/A"),
    isVisible: () => true,
  },
  {
    key: "pnlPercentage",
    label: "PNL (net)",
    format: (data) =>
      data.pnl !== undefined
        ? `${data.pnl.pnlPercentage > 0 ? "+" : ""}${data.pnl.pnlPercentage.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "cost",
    label: "Cost (USD)",
    format: (data) => (data.cost !== undefined ? `${data.cost.toFixed(2)} USD` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "timestamp",
    label: "Timestamp",
    format: (data) => new Date(data.timestamp).toISOString(),
    isVisible: () => true,
  },
  {
    key: "mode",
    label: "Mode",
    format: (data) => (data.backtest ? "Backtest" : "Live"),
    isVisible: () => true,
  },
];
