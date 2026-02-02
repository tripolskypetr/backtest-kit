import { ColumnModel } from "../model/Column.model";
import { PartialEvent } from "../model/PartialStatistics.model";
import { toPlainString } from "../helpers/toPlainString";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Column configuration for partial profit/loss markdown reports.
 *
 * Defines the table structure for displaying partial position exit events in trading reports.
 * Each column specifies how to format and display partial profit and loss level events.
 *
 * Used by {@link PartialMarkdownService} to generate markdown tables showing:
 * - Event information (action type: profit or loss)
 * - Signal identification (symbol, strategy name, signal ID, position)
 * - Exit level information (percentage level reached)
 * - Price data (current price at partial exit)
 * - Timing information (timestamp, mode: backtest or live)
 *
 * @remarks
 * This configuration tracks partial position exits at predefined profit/loss levels.
 * The "note" column visibility is controlled by {@link GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE}.
 * Useful for analyzing risk management strategies and partial exit performance.
 *
 * @example
 * ```typescript
 * import { partial_columns } from "./assets/partial.columns";
 *
 * // Use with PartialMarkdownService
 * const service = new PartialMarkdownService();
 * await service.getReport("BTCUSDT", "my-strategy", partial_columns);
 *
 * // Or customize to show only key fields
 * const customColumns = partial_columns.filter(col =>
 *   ["action", "symbol", "level", "timestamp"].includes(col.key)
 * );
 * await service.getReport("BTCUSDT", "my-strategy", customColumns);
 * ```
 *
 * @see {@link PartialMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link PartialEvent} for data structure
 */
export const partial_columns: ColumnModel<PartialEvent>[] = [
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
    key: "level",
    label: "Level %",
    format: (data) =>
      data.action === "profit" ? `+${data.level}%` : `-${data.level}%`,
    isVisible: () => true,
  },
  {
    key: "currentPrice",
    label: "Current Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "priceOpen",
    label: "Entry Price",
    format: (data) => (data.priceOpen ? `${data.priceOpen.toFixed(8)} USD` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "priceTakeProfit",
    label: "Take Profit",
    format: (data) => (data.priceTakeProfit ? `${data.priceTakeProfit.toFixed(8)} USD` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "priceStopLoss",
    label: "Stop Loss",
    format: (data) => (data.priceStopLoss ? `${data.priceStopLoss.toFixed(8)} USD` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "originalPriceTakeProfit",
    label: "Original TP",
    format: (data) => (data.originalPriceTakeProfit ? `${data.originalPriceTakeProfit.toFixed(8)} USD` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "originalPriceStopLoss",
    label: "Original SL",
    format: (data) => (data.originalPriceStopLoss ? `${data.originalPriceStopLoss.toFixed(8)} USD` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "partialExecuted",
    label: "Partial Executed %",
    format: (data) => (data.partialExecuted !== undefined ? `${data.partialExecuted.toFixed(2)}%` : "N/A"),
    isVisible: () => true,
  },
  {
    key: "note",
    label: "Note",
    format: (data) => data.note || "",
    isVisible: () => GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE,
  },
  {
    key: "pendingAt",
    label: "Pending At",
    format: (data) => (data.pendingAt ? new Date(data.pendingAt).toISOString() : "N/A"),
    isVisible: () => true,
  },
  {
    key: "scheduledAt",
    label: "Scheduled At",
    format: (data) => (data.scheduledAt ? new Date(data.scheduledAt).toISOString() : "N/A"),
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
