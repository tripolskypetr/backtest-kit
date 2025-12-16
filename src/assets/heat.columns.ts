import { IHeatmapRow } from "../interfaces/Heatmap.interface";
import { ColumnModel } from "../model/Column.model";
import { str } from "functools-kit";

export const heat_columns: ColumnModel<IHeatmapRow>[] = [
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.symbol,
    isVisible: () => true,
  },
  {
    key: "totalPnl",
    label: "Total PNL",
    format: (data) =>
      data.totalPnl !== null ? str(data.totalPnl, "%+.2f%%") : "N/A",
    isVisible: () => true,
  },
  {
    key: "sharpeRatio",
    label: "Sharpe",
    format: (data) =>
      data.sharpeRatio !== null ? str(data.sharpeRatio, "%.2f") : "N/A",
    isVisible: () => true,
  },
  {
    key: "profitFactor",
    label: "PF",
    format: (data) =>
      data.profitFactor !== null ? str(data.profitFactor, "%.2f") : "N/A",
    isVisible: () => true,
  },
  {
    key: "expectancy",
    label: "Expect",
    format: (data) =>
      data.expectancy !== null ? str(data.expectancy, "%+.2f%%") : "N/A",
    isVisible: () => true,
  },
  {
    key: "winRate",
    label: "WR",
    format: (data) =>
      data.winRate !== null ? str(data.winRate, "%.1f%%") : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgWin",
    label: "Avg Win",
    format: (data) =>
      data.avgWin !== null ? str(data.avgWin, "%+.2f%%") : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgLoss",
    label: "Avg Loss",
    format: (data) =>
      data.avgLoss !== null ? str(data.avgLoss, "%+.2f%%") : "N/A",
    isVisible: () => true,
  },
  {
    key: "maxDrawdown",
    label: "Max DD",
    format: (data) =>
      data.maxDrawdown !== null ? str(-data.maxDrawdown, "%.2f%%") : "N/A",
    isVisible: () => true,
  },
  {
    key: "maxWinStreak",
    label: "W Streak",
    format: (data) => data.maxWinStreak.toString(),
    isVisible: () => true,
  },
  {
    key: "maxLossStreak",
    label: "L Streak",
    format: (data) => data.maxLossStreak.toString(),
    isVisible: () => true,
  },
  {
    key: "totalTrades",
    label: "Trades",
    format: (data) => data.totalTrades.toString(),
    isVisible: () => true,
  },
];
