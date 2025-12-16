import { ColumnModel } from "../model/Column.model";
import { ScheduledEvent } from "../model/ScheduleStatistics.model";
import { toPlainString } from "../helpers/toPlainString";
import { GLOBAL_CONFIG } from "../config/params";

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
    key: "duration",
    label: "Wait Time (min)",
    format: (data) =>
      data.duration !== undefined ? `${data.duration}` : "N/A",
    isVisible: () => true,
  },
];
