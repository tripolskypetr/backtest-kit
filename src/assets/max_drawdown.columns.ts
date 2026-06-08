import { ColumnModel } from "../model/Column.model";
import { getPriceScale } from "../helpers/getPriceScale";
import { MaxDrawdownEvent } from "../model/MaxDrawdownStatistics.model";

/**
 * Column configuration for max drawdown markdown reports.
 *
 * Defines the table structure for displaying max-drawdown-record events.
 *
 * @see MaxDrawdownMarkdownService
 * @see ColumnModel
 * @see MaxDrawdownEvent
 */
export const max_drawdown_columns: ColumnModel<MaxDrawdownEvent>[] = [
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
    key: "pnl",
    label: "PNL (net)",
    format: (data) => {
      const pnlPercentage = data.pnl.pnlPercentage;
      return `${pnlPercentage > 0 ? "+" : ""}${pnlPercentage.toFixed(2)}%`;
    },
    isVisible: () => true,
  },
  {
    key: "pnlCost",
    label: "PNL (USD)",
    format: (data) => `${data.pnl.pnlCost > 0 ? "+" : ""}${data.pnl.pnlCost.toFixed(2)} USD`,
    isVisible: () => true,
  },
  {
    key: "currentPrice",
    label: "DD Price",
    format: (data) => `${data.currentPrice.toFixed(getPriceScale(data.currentPrice))} USD`,
    isVisible: () => true,
  },
  {
    key: "priceOpen",
    label: "Entry Price",
    format: (data) => `${data.priceOpen.toFixed(getPriceScale(data.priceOpen))} USD`,
    isVisible: () => true,
  },
  {
    key: "priceTakeProfit",
    label: "Take Profit",
    format: (data) => `${data.priceTakeProfit.toFixed(getPriceScale(data.priceTakeProfit))} USD`,
    isVisible: () => true,
  },
  {
    key: "priceStopLoss",
    label: "Stop Loss",
    format: (data) => `${data.priceStopLoss.toFixed(getPriceScale(data.priceStopLoss))} USD`,
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
