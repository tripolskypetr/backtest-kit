import { ColumnModel } from "../model/Column.model";
import { SyncEvent } from "../model/SyncStatistics.model";

/**
 * Column configuration for signal sync markdown reports.
 *
 * Defines the table structure for displaying signal lifecycle sync events:
 * - signal-open: limit order filled, position activated
 * - signal-close: position closed for any reason
 *
 * Used by {@link SyncMarkdownService} to generate markdown tables showing:
 * - Signal identification (symbol, strategy name, signal ID)
 * - Action information (action type, current price, position direction)
 * - Price levels (entry, take profit, stop loss, originals)
 * - Timing information (timestamp, scheduledAt, pendingAt)
 * - PNL and cost information
 * - Close reason (for signal-close events)
 *
 * @see {@link SyncMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link SyncEvent} for data structure
 */
export const sync_columns: ColumnModel<SyncEvent>[] = [
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
    key: "position",
    label: "Position",
    format: (data) => data.position,
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
    format: (data) => `${data.priceOpen.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "priceTakeProfit",
    label: "Take Profit",
    format: (data) => `${data.priceTakeProfit.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "priceStopLoss",
    label: "Stop Loss",
    format: (data) => `${data.priceStopLoss.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "totalEntries",
    label: "DCA Entries",
    format: (data) => String(data.totalEntries),
    isVisible: () => true,
  },
  {
    key: "totalPartials",
    label: "Partial Closes",
    format: (data) => String(data.totalPartials),
    isVisible: () => true,
  },
  {
    key: "pnlPercentage",
    label: "PNL (net)",
    format: (data) =>
      `${data.pnl.pnlPercentage > 0 ? "+" : ""}${data.pnl.pnlPercentage.toFixed(2)}%`,
    isVisible: () => true,
  },
  {
    key: "closeReason",
    label: "Close Reason",
    format: (data) => data.closeReason || "N/A",
    isVisible: () => true,
  },
  {
    key: "createdAt",
    label: "Created At",
    format: (data) => data.createdAt,
    isVisible: () => true,
  },
  {
    key: "mode",
    label: "Mode",
    format: (data) => (data.backtest ? "Backtest" : "Live"),
    isVisible: () => true,
  },
];
