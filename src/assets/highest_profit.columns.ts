import { ColumnModel } from "../model/Column.model";
import { HighestProfitEvent } from "../model/HighestProfitStatistics.model";

/**
 * Column configuration for highest profit markdown reports.
 *
 * Defines the table structure for displaying highest-profit-record events.
 *
 * @see HighestProfitMarkdownService
 * @see ColumnModel
 * @see HighestProfitEvent
 */
export const highest_profit_columns: ColumnModel<HighestProfitEvent>[] = [
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
    label: "Peak Price",
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
