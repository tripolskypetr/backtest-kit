import { ColumnModel } from "../model/Column.model";
import { TickEvent } from "../model/LiveStatistics.model";
import { toPlainString } from "../helpers/toPlainString";
import { GLOBAL_CONFIG } from "../config/params";

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
      data.openPrice !== undefined ? `${data.openPrice.toFixed(8)} USD` : "N/A",
    isVisible: () => true,
  },
  {
    key: "takeProfit",
    label: "Take Profit",
    format: (data) =>
      data.takeProfit !== undefined
        ? `${data.takeProfit.toFixed(8)} USD`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "stopLoss",
    label: "Stop Loss",
    format: (data) =>
      data.stopLoss !== undefined ? `${data.stopLoss.toFixed(8)} USD` : "N/A",
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
];
