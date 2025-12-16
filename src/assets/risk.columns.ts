import { ColumnModel } from "../model/Column.model";
import { RiskEvent } from "../model/RiskStatistics.model";
import { toPlainString } from "../helpers/toPlainString";
import { GLOBAL_CONFIG } from "../config/params";

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
    key: "position",
    label: "Position",
    format: (data) => data.pendingSignal.position.toUpperCase(),
    isVisible: () => true,
  },
  {
    key: "note",
    label: "Note",
    format: (data) => toPlainString(data.pendingSignal.note ?? "N/A"),
    isVisible: () => GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE,
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
    key: "comment",
    label: "Reason",
    format: (data) => data.comment,
    isVisible: () => true,
  },
  {
    key: "timestamp",
    label: "Timestamp",
    format: (data) => new Date(data.timestamp).toISOString(),
    isVisible: () => true,
  },
];
