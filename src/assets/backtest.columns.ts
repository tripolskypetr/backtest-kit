import { IStrategyTickResultClosed } from "../interfaces/Strategy.interface";
import { ColumnModel } from "../model/Column.model";
import { toPlainString } from "../helpers/toPlainString";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Column configuration for backtest markdown reports.
 *
 * Defines the table structure for displaying closed trading signals in backtest reports.
 * Each column specifies how to format and display specific signal data fields.
 *
 * Used by {@link BacktestMarkdownService} to generate markdown tables showing:
 * - Signal identification (ID, symbol, position)
 * - Price levels (open, close, take profit, stop loss)
 * - Performance metrics (PNL percentage, close reason)
 * - Timing information (duration, timestamps)
 *
 * @remarks
 * Columns can be conditionally visible based on {@link GLOBAL_CONFIG} settings.
 * For example, the "note" column visibility is controlled by `CC_REPORT_SHOW_SIGNAL_NOTE`.
 *
 * @example
 * ```typescript
 * import { backtest_columns } from "./assets/backtest.columns";
 *
 * // Use with BacktestMarkdownService
 * const service = new BacktestMarkdownService();
 * await service.getReport("BTCUSDT", "my-strategy", backtest_columns);
 *
 * // Or customize columns
 * const customColumns = backtest_columns.filter(col => col.key !== "note");
 * await service.getReport("BTCUSDT", "my-strategy", customColumns);
 * ```
 *
 * @see {@link BacktestMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link IStrategyTickResultClosed} for data structure
 */
export const backtest_columns: ColumnModel<IStrategyTickResultClosed>[] = [
  {
    key: "signalId",
    label: "Signal ID",
    format: (data) => data.signal.id,
    isVisible: () => true,
  },
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.signal.symbol,
    isVisible: () => true,
  },
  {
    key: "position",
    label: "Position",
    format: (data) => data.signal.position.toUpperCase(),
    isVisible: () => true,
  },
  {
    key: "note",
    label: "Note",
    format: (data) => toPlainString(data.signal.note ?? "N/A"),
    isVisible: () => GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE,
  },
  {
    key: "openPrice",
    label: "Open Price",
    format: (data) => `${data.signal.priceOpen.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "closePrice",
    label: "Close Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "takeProfit",
    label: "Take Profit",
    format: (data) => `${data.signal.priceTakeProfit.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "stopLoss",
    label: "Stop Loss",
    format: (data) => `${data.signal.priceStopLoss.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "originalPriceTakeProfit",
    label: "Original TP",
    format: (data) => `${data.signal.originalPriceTakeProfit.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "originalPriceStopLoss",
    label: "Original SL",
    format: (data) => `${data.signal.originalPriceStopLoss.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "pnl",
    label: "PNL (net)",
    format: (data) => {
      const pnlPercentage = data.pnl.pnlPercentage;
      return `${pnlPercentage > 0 ? "+" : ""}${pnlPercentage.toFixed(2)}%`;
    },
    isVisible: () => true,
  },
  {
    key: "totalExecuted",
    label: "Total Executed",
    format: (data) => `${data.signal.totalExecuted.toFixed(1)}%`,
    isVisible: () => true,
  },
  {
    key: "partialCloses",
    label: "Partial Closes",
    format: (data) => {
      const partial = data.signal._partial;
      if (!partial || partial.length === 0) return "N/A";
      const profitCount = partial.filter(p => p.type === "profit").length;
      const lossCount = partial.filter(p => p.type === "loss").length;
      const profitPercent = partial.filter(p => p.type === "profit").reduce((sum, p) => sum + p.percent, 0);
      const lossPercent = partial.filter(p => p.type === "loss").reduce((sum, p) => sum + p.percent, 0);
      return `${partial.length} (↑${profitCount}: ${profitPercent.toFixed(1)}%, ↓${lossCount}: ${lossPercent.toFixed(1)}%)`;
    },
    isVisible: () => true,
  },
  {
    key: "closeReason",
    label: "Close Reason",
    format: (data) => data.closeReason,
    isVisible: () => true,
  },
  {
    key: "duration",
    label: "Duration (min)",
    format: (data) => {
      const durationMs = data.closeTimestamp - data.signal.pendingAt;
      const durationMin = Math.round(durationMs / 60000);
      return `${durationMin}`;
    },
    isVisible: () => true,
  },
  {
    key: "openTimestamp",
    label: "Open Time",
    format: (data) => new Date(data.signal.pendingAt).toISOString(),
    isVisible: () => true,
  },
  {
    key: "closeTimestamp",
    label: "Close Time",
    format: (data) => new Date(data.closeTimestamp).toISOString(),
    isVisible: () => true,
  },
];
