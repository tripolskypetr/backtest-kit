import { ColumnModel } from "../model/Column.model";
import { ScheduledEvent } from "../model/ScheduleStatistics.model";
import { toPlainString } from "../helpers/toPlainString";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Column configuration for scheduled signals markdown reports.
 *
 * Defines the table structure for displaying scheduled, opened, and cancelled signal events.
 * Each column specifies how to format and display signal scheduling and activation data.
 *
 * Used by {@link ScheduleMarkdownService} to generate markdown tables showing:
 * - Event information (timestamp, action: scheduled/opened/cancelled)
 * - Signal identification (symbol, signal ID, position)
 * - Price data (current price, entry price, take profit, stop loss)
 * - Timing information (wait time in minutes before activation or cancellation)
 * - Cancellation details (reason: timeout/stoploss/user, optional user cancel ID)
 *
 * @remarks
 * This configuration tracks the lifecycle of scheduled signals from creation to activation or cancellation.
 * The "note" column visibility is controlled by {@link GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE}.
 * Helps analyze signal scheduling effectiveness and cancellation patterns.
 *
 * Cancellation tracking includes:
 * - cancelReason: "timeout" (expired wait time), "price_reject" (price hit SL), "user" (manual cancellation)
 * - cancelId: Optional ID provided when calling Backtest.cancel() or Live.cancel()
 *
 * @example
 * ```typescript
 * import { schedule_columns } from "./assets/schedule.columns";
 *
 * // Use with ScheduleMarkdownService
 * const service = new ScheduleMarkdownService();
 * await service.getReport("BTCUSDT", "my-strategy", schedule_columns);
 *
 * // Or customize for cancellation analysis
 * const customColumns = schedule_columns.filter(col =>
 *   ["timestamp", "action", "cancelReason", "cancelId"].includes(col.key)
 * );
 * await service.getReport("BTCUSDT", "my-strategy", customColumns);
 * ```
 *
 * @see {@link ScheduleMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link ScheduledEvent} for data structure
 */
export const schedule_columns: ColumnModel<ScheduledEvent>[] = [
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
    format: (data) => data.symbol,
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
    key: "note",
    label: "Note",
    format: (data) => toPlainString(data.note ?? "N/A"),
    isVisible: () => GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE,
  },
  {
    key: "currentPrice",
    label: "Current Price",
    format: (data) =>
      data.currentPrice ? `${data.currentPrice.toFixed(8)} USD` : "N/A",
    isVisible: () => true,
  },
  {
    key: "priceOpen",
    label: "Entry Price",
    format: (data) => `${data.priceOpen.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "takeProfit",
    label: "Take Profit",
    format: (data) => `${data.takeProfit.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "stopLoss",
    label: "Stop Loss",
    format: (data) => `${data.stopLoss.toFixed(8)} USD`,
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
    key: "totalExecuted",
    label: "Total Executed",
    format: (data) =>
      data.totalExecuted !== undefined ? `${data.totalExecuted.toFixed(1)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "duration",
    label: "Wait Time (min)",
    format: (data) =>
      data.duration !== undefined ? `${data.duration}` : "N/A",
    isVisible: () => true,
  },
  {
    key: "cancelReason",
    label: "Cancel Reason",
    format: (data) =>
      data.cancelReason ? data.cancelReason.toUpperCase() : "N/A",
    isVisible: () => true,
  },
  {
    key: "cancelId",
    label: "Cancel ID",
    format: (data) => data.cancelId ?? "N/A",
    isVisible: () => true,
  },
];
