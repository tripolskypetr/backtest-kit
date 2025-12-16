import { ColumnModel } from "../model/Column.model";
import {
  IStrategyResult,
  SignalData,
} from "../model/WalkerStatistics.model";

/**
 * Checks if a value is unsafe for display (not a number, NaN, or Infinity).
 */
function isUnsafe(value: number | null): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value !== "number") {
    return true;
  }
  if (isNaN(value)) {
    return true;
  }
  if (!isFinite(value)) {
    return true;
  }
  return false;
}

/**
 * Formats a metric value for display.
 * Returns "N/A" for unsafe values, otherwise formats with 2 decimal places.
 */
export function formatMetric(value: number | null): string {
  if (isUnsafe(value)) {
    return "N/A";
  }
  return value!.toFixed(2);
}

/**
 * Static column configuration for walker strategy comparison table.
 * Contains all columns for comparing strategies with a generic "Metric" header.
 */
export const walker_strategy_columns: ColumnModel<IStrategyResult>[] = [
  {
    key: "strategy",
    label: "Strategy",
    format: (data) => data.strategyName,
    isVisible: () => true,
  },
  {
    key: "metric",
    label: "Metric",
    format: (data) => formatMetric(data.metricValue),
    isVisible: () => true,
  },
  {
    key: "totalSignals",
    label: "Total Signals",
    format: (data) => `${data.stats.totalSignals}`,
    isVisible: () => true,
  },
  {
    key: "winRate",
    label: "Win Rate",
    format: (data) =>
      data.stats.winRate !== null
        ? `${data.stats.winRate.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgPnl",
    label: "Avg PNL",
    format: (data) =>
      data.stats.avgPnl !== null
        ? `${data.stats.avgPnl > 0 ? "+" : ""}${data.stats.avgPnl.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "totalPnl",
    label: "Total PNL",
    format: (data) =>
      data.stats.totalPnl !== null
        ? `${data.stats.totalPnl > 0 ? "+" : ""}${data.stats.totalPnl.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "sharpeRatio",
    label: "Sharpe Ratio",
    format: (data) =>
      data.stats.sharpeRatio !== null
        ? `${data.stats.sharpeRatio.toFixed(3)}`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "stdDev",
    label: "Std Dev",
    format: (data) =>
      data.stats.stdDev !== null
        ? `${data.stats.stdDev.toFixed(3)}%`
        : "N/A",
    isVisible: () => true,
  },
];

/**
 * Column configuration for PNL table.
 * Defines all columns for displaying closed signals across strategies.
 */
export const walker_pnl_columns: ColumnModel<SignalData>[] = [
  {
    key: "strategy",
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
    key: "symbol",
    label: "Symbol",
    format: (data) => data.symbol,
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
    format: (data) => `${data.pnl > 0 ? "+" : ""}${data.pnl.toFixed(2)}%`,
    isVisible: () => true,
  },
  {
    key: "closeReason",
    label: "Close Reason",
    format: (data) => data.closeReason,
    isVisible: () => true,
  },
  {
    key: "openTime",
    label: "Open Time",
    format: (data) => new Date(data.openTime).toISOString(),
    isVisible: () => true,
  },
  {
    key: "closeTime",
    label: "Close Time",
    format: (data) => new Date(data.closeTime).toISOString(),
    isVisible: () => true,
  },
];
