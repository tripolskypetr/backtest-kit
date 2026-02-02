import { ColumnModel } from "../model/Column.model";
import { TickEvent } from "../model/LiveStatistics.model";
import { toPlainString } from "../helpers/toPlainString";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Column configuration for live trading markdown reports.
 *
 * Defines the table structure for displaying real-time trading events in live trading reports.
 * Each column specifies how to format and display live trading event data fields.
 *
 * Used by {@link LiveMarkdownService} to generate markdown tables showing:
 * - Event information (timestamp, action type)
 * - Signal identification (symbol, signal ID, position)
 * - Price data (current price, open price, take profit, stop loss)
 * - Performance metrics (PNL percentage, close reason, duration)
 * - Position tracking (percentage to TP/SL)
 *
 * @remarks
 * This configuration tracks all event types: idle, opened, active, and closed signals.
 * The "note" column visibility is controlled by {@link GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE}.
 *
 * @example
 * ```typescript
 * import { live_columns } from "./assets/live.columns";
 *
 * // Use with LiveMarkdownService
 * const service = new LiveMarkdownService();
 * await service.getReport("BTCUSDT", "my-strategy", live_columns);
 *
 * // Or customize for minimal display
 * const customColumns = live_columns.filter(col =>
 *   ["timestamp", "action", "symbol", "pnl"].includes(col.key)
 * );
 * await service.getReport("BTCUSDT", "my-strategy", customColumns);
 * ```
 *
 * @see {@link LiveMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link TickEvent} for data structure
 */
export const live_columns: ColumnModel<TickEvent>[] = [
  {
    key: "timestamp",
    label: "Timestamp",
    format: (data) => new Date(data.timestamp).toISOString(),
    isVisible: () => true,
  },
  {
    key: "action",
    label: "Action",
    format: (data) => data.action.toUpperCase(),
    isVisible: () => true,
  },
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.symbol ?? "N/A",
    isVisible: () => true,
  },
  {
    key: "signalId",
    label: "Signal ID",
    format: (data) => data.signalId ?? "N/A",
    isVisible: () => true,
  },
  {
    key: "position",
    label: "Position",
    format: (data) => data.position?.toUpperCase() ?? "N/A",
    isVisible: () => true,
  },
  {
    key: "note",
    label: "Note",
    format: (data) => toPlainString(data.note ?? "N/A"),
    isVisible: () => GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE,
  },
  {
    key: "currentPrice",
    label: "Current Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "openPrice",
    label: "Open Price",
    format: (data) =>
      data.priceOpen !== undefined ? `${data.priceOpen.toFixed(8)} USD` : "N/A",
    isVisible: () => true,
  },
  {
    key: "takeProfit",
    label: "Take Profit",
    format: (data) =>
      data.priceTakeProfit !== undefined
        ? `${data.priceTakeProfit.toFixed(8)} USD`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "stopLoss",
    label: "Stop Loss",
    format: (data) =>
      data.priceStopLoss !== undefined ? `${data.priceStopLoss.toFixed(8)} USD` : "N/A",
    isVisible: () => true,
  },
  {
    key: "originalPriceTakeProfit",
    label: "Original TP",
    format: (data) =>
      data.originalPriceTakeProfit !== undefined
        ? `${data.originalPriceTakeProfit.toFixed(8)} USD`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "originalPriceStopLoss",
    label: "Original SL",
    format: (data) =>
      data.originalPriceStopLoss !== undefined
        ? `${data.originalPriceStopLoss.toFixed(8)} USD`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "partialExecuted",
    label: "Partial Executed %",
    format: (data) =>
      data.partialExecuted !== undefined ? `${data.partialExecuted.toFixed(1)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "percentTp",
    label: "% to TP",
    format: (data) =>
      data.percentTp !== undefined ? `${data.percentTp.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "percentSl",
    label: "% to SL",
    format: (data) =>
      data.percentSl !== undefined ? `${data.percentSl.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "pnl",
    label: "PNL (net)",
    format: (data) => {
      if (data.pnl === undefined) return "N/A";
      return `${data.pnl > 0 ? "+" : ""}${data.pnl.toFixed(2)}%`;
    },
    isVisible: () => true,
  },
  {
    key: "closeReason",
    label: "Close Reason",
    format: (data) => data.closeReason ?? "N/A",
    isVisible: () => true,
  },
  {
    key: "duration",
    label: "Duration (min)",
    format: (data) =>
      data.duration !== undefined ? `${data.duration}` : "N/A",
    isVisible: () => true,
  },
  {
    key: "pendingAt",
    label: "Pending At",
    format: (data) =>
      data.pendingAt !== undefined ? new Date(data.pendingAt).toISOString() : "N/A",
    isVisible: () => true,
  },
  {
    key: "scheduledAt",
    label: "Scheduled At",
    format: (data) =>
      data.scheduledAt !== undefined ? new Date(data.scheduledAt).toISOString() : "N/A",
    isVisible: () => true,
  },
];
