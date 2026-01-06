import { IHeatmapRow } from "../interfaces/Heatmap.interface";
import { ColumnModel } from "../model/Column.model";
import { str } from "functools-kit";

/**
 * Column configuration for portfolio heatmap markdown reports.
 *
 * Defines the table structure for displaying aggregated per-symbol statistics in portfolio heatmap reports.
 * Each column specifies how to format and display portfolio performance metrics across different trading symbols.
 *
 * Used by {@link HeatMarkdownService} to generate markdown tables showing:
 * - Symbol identification
 * - Performance metrics (Total PNL, Sharpe Ratio, Profit Factor, Expectancy)
 * - Risk metrics (Win Rate, Average Win/Loss, Max Drawdown)
 * - Trading activity (Total Trades, Win/Loss Streaks)
 *
 * @remarks
 * This configuration is used to create portfolio-wide views that aggregate statistics per symbol.
 * The heatmap service automatically sorts symbols by Sharpe Ratio (best performers first).
 *
 * @example
 * ```typescript
 * import { heat_columns } from "./assets/heat.columns";
 *
 * // Use with HeatMarkdownService
 * const service = new HeatMarkdownService();
 * await service.getReport("my-strategy", heat_columns);
 *
 * // Or customize to show only key metrics
 * const customColumns = heat_columns.filter(col =>
 *   ["symbol", "totalPnl", "sharpeRatio", "totalTrades"].includes(col.key)
 * );
 * await service.getReport("my-strategy", customColumns);
 * ```
 *
 * @see {@link HeatMarkdownService} for usage in report generation
 * @see {@link ColumnModel} for column interface definition
 * @see {@link IHeatmapRow} for data structure
 */
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
      data.totalPnl !== null ? str(data.totalPnl, "%") : "N/A",
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
      data.expectancy !== null ? str(data.expectancy, "%") : "N/A",
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
      data.avgWin !== null ? str(data.avgWin, "%") : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgLoss",
    label: "Avg Loss",
    format: (data) =>
      data.avgLoss !== null ? str(data.avgLoss, "%") : "N/A",
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
