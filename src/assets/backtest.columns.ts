import { IStrategyTickResultClosed } from "../interfaces/Strategy.interface";
import { ColumnModel } from "../model/Column.model";
import { toPlainString } from "../helpers/toPlainString";
import { GLOBAL_CONFIG } from "../config/params";

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
    key: "pnl",
    label: "PNL (net)",
    format: (data) => {
      const pnlPercentage = data.pnl.pnlPercentage;
      return `${pnlPercentage > 0 ? "+" : ""}${pnlPercentage.toFixed(2)}%`;
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
