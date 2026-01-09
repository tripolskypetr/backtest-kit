import { ColumnModel } from "../model/Column.model";
import { BreakevenEvent } from "../model/BreakevenStatistics.model";

/**
 * Column configuration for breakeven markdown reports.
 *
 * Defines the table structure for displaying breakeven events in trading reports.
 * Each column specifies how to format and display when a signal's stop-loss was moved to breakeven.
 *
 * Used by {@link BreakevenMarkdownService} to generate markdown tables showing:
 * - Signal identification (symbol, strategy name, signal ID, position)
 * - Price information (entry price, current price when breakeven was reached)
 * - Timing information (timestamp, mode: backtest or live)
 *
 * @remarks
 * This configuration tracks breakeven protection events - when a signal's stop-loss
 * is moved to the entry price after price has moved far enough in profit direction
 * to cover transaction costs (slippage + fees).
 *
 * @example
 * ```typescript
 * import { breakeven_columns } from "./assets/breakeven.columns";
 *
 * // Use with BreakevenMarkdownService
 * const service = new BreakevenMarkdownService();
 * await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false, breakeven_columns);
 *
 * // Or customize to show only key fields
 * const customColumns = breakeven_columns.filter(col =>
 *   ["symbol", "position", "priceOpen", "timestamp"].includes(col.key)
 * );
 * await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false, customColumns);
 * ```
 *
 * @see {@link BreakevenMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link BreakevenEvent} for data structure
 */
export const breakeven_columns: ColumnModel<BreakevenEvent>[] = [
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
    key: "position",
    label: "Position",
    format: (data) => data.position.toUpperCase(),
    isVisible: () => true,
  },
  {
    key: "priceOpen",
    label: "Entry Price",
    format: (data) => `${data.priceOpen.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "currentPrice",
    label: "Breakeven Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
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
