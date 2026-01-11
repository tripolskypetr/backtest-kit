import { ColumnModel } from "../model/Column.model";
import { RiskEvent } from "../model/RiskStatistics.model";
import { toPlainString } from "../helpers/toPlainString";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Column configuration for risk management markdown reports.
 *
 * Defines the table structure for displaying risk rejection events in risk management reports.
 * Each column specifies how to format and display signals that were rejected due to risk limits.
 *
 * Used by {@link RiskMarkdownService} to generate markdown tables showing:
 * - Signal identification (symbol, strategy name, signal ID, position)
 * - Exchange information (exchange name, active position count)
 * - Price data (open price, take profit, stop loss, current price)
 * - Rejection details (rejection ID, rejection reason, timestamp)
 *
 * @remarks
 * This configuration helps analyze when and why the risk management system rejected signals.
 * - The "note" column (signal note) visibility is controlled by {@link GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE}.
 * - The "rejectionNote" column (rejection reason) is always visible as it contains critical risk information.
 * - The "rejectionId" can be used to correlate rejections with signal IDs for debugging.
 * Useful for tuning risk parameters and understanding risk control effectiveness.
 *
 * @example
 * ```typescript
 * import { risk_columns } from "./assets/risk.columns";
 *
 * // Use with RiskMarkdownService
 * const service = new RiskMarkdownService();
 * await service.getReport("BTCUSDT", "my-strategy", risk_columns);
 *
 * // Or customize to focus on rejection reasons
 * const customColumns = risk_columns.filter(col =>
 *   ["symbol", "strategyName", "rejectionId", "rejectionNote", "activePositionCount", "timestamp"].includes(col.key)
 * );
 * await service.getReport("BTCUSDT", "my-strategy", customColumns);
 * ```
 *
 * @see {@link RiskMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link RiskEvent} for data structure
 */
export const risk_columns: ColumnModel<RiskEvent>[] = [
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
    format: (data) => data.pendingSignal.id || "N/A",
    isVisible: () => true,
  },
  {
    key: "note",
    label: "Note",
    format: (data) => toPlainString(data.pendingSignal.note ?? "N/A"),
    isVisible: () => GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE,
  },
  {
    key: "position",
    label: "Position",
    format: (data) => data.pendingSignal.position.toUpperCase(),
    isVisible: () => true,
  },
  {
    key: "exchangeName",
    label: "Exchange",
    format: (data) => data.exchangeName,
    isVisible: () => true,
  },
  {
    key: "openPrice",
    label: "Open Price",
    format: (data) =>
      data.pendingSignal.priceOpen !== undefined
        ? `${data.pendingSignal.priceOpen.toFixed(8)} USD`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "takeProfit",
    label: "Take Profit",
    format: (data) =>
      data.pendingSignal.priceTakeProfit !== undefined
        ? `${data.pendingSignal.priceTakeProfit.toFixed(8)} USD`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "stopLoss",
    label: "Stop Loss",
    format: (data) =>
      data.pendingSignal.priceStopLoss !== undefined
        ? `${data.pendingSignal.priceStopLoss.toFixed(8)} USD`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "originalPriceTakeProfit",
    label: "Original TP",
    format: (data) =>
      data.pendingSignal.originalPriceTakeProfit !== undefined
        ? `${data.pendingSignal.originalPriceTakeProfit.toFixed(8)} USD`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "originalPriceStopLoss",
    label: "Original SL",
    format: (data) =>
      data.pendingSignal.originalPriceStopLoss !== undefined
        ? `${data.pendingSignal.originalPriceStopLoss.toFixed(8)} USD`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "totalExecuted",
    label: "Total Executed",
    format: (data) =>
      data.pendingSignal.totalExecuted !== undefined
        ? `${data.pendingSignal.totalExecuted.toFixed(1)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "currentPrice",
    label: "Current Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "activePositionCount",
    label: "Active Positions",
    format: (data) => data.activePositionCount.toString(),
    isVisible: () => true,
  },
  {
    key: "rejectionId",
    label: "ID",
    format: (data) => data.rejectionId ?? "N/A",
    isVisible: () => true,
  },
  {
    key: "rejectionNote",
    label: "Rejection Reason",
    format: (data) => data.rejectionNote,
    isVisible: () => true,
  },
  {
    key: "timestamp",
    label: "Timestamp",
    format: (data) => new Date(data.timestamp).toISOString(),
    isVisible: () => true,
  },
];
