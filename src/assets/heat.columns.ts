import { IHeatmapRow } from "../interfaces/Heatmap.interface";
import { ColumnModel } from "../model/Column.model";

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
      data.totalPnl !== null ? `${data.totalPnl.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "sharpeRatio",
    label: "Sharpe",
    format: (data) =>
      data.sharpeRatio !== null ? data.sharpeRatio.toFixed(3) : "N/A",
    isVisible: () => true,
  },
  {
    key: "annualizedSharpeRatio",
    label: "Ann Sharpe",
    format: (data) =>
      data.annualizedSharpeRatio !== null ? data.annualizedSharpeRatio.toFixed(3) : "N/A",
    isVisible: () => true,
  },
  {
    key: "certaintyRatio",
    label: "Certainty",
    format: (data) =>
      data.certaintyRatio !== null ? data.certaintyRatio.toFixed(3) : "N/A",
    isVisible: () => true,
  },
  {
    key: "expectedYearlyReturns",
    label: "Exp Yearly",
    format: (data) =>
      data.expectedYearlyReturns !== null
        ? `${data.expectedYearlyReturns.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "tradesPerYear",
    label: "Trades/Yr",
    format: (data) =>
      data.tradesPerYear !== null ? data.tradesPerYear.toFixed(1) : "N/A",
    isVisible: () => true,
  },
  {
    key: "profitFactor",
    label: "PF",
    format: (data) =>
      data.profitFactor !== null ? data.profitFactor.toFixed(3) : "N/A",
    isVisible: () => true,
  },
  {
    key: "expectancy",
    label: "Expect",
    format: (data) =>
      data.expectancy !== null ? `${data.expectancy.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "winRate",
    label: "WR",
    format: (data) =>
      data.winRate !== null ? `${data.winRate.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgWin",
    label: "Avg Win",
    format: (data) =>
      data.avgWin !== null ? `${data.avgWin.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgLoss",
    label: "Avg Loss",
    format: (data) =>
      data.avgLoss !== null ? `${data.avgLoss.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "maxDrawdown",
    label: "Max DD",
    format: (data) =>
      data.maxDrawdown !== null ? `${(-data.maxDrawdown).toFixed(2)}%` : "N/A",
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
  {
    key: "avgPeakPnl",
    label: "Avg Peak PNL",
    format: (data) =>
      data.avgPeakPnl !== null ? `${data.avgPeakPnl.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgFallPnl",
    label: "Avg DD PNL",
    format: (data) =>
      data.avgFallPnl !== null ? `${data.avgFallPnl.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "peakProfitPnl",
    label: "Peak Profit PNL",
    format: (data) =>
      data.peakProfitPnl !== null ? `${data.peakProfitPnl.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "maxDrawdownPnl",
    label: "Max DD PNL",
    format: (data) =>
      data.maxDrawdownPnl !== null ? `${data.maxDrawdownPnl.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "medianPnl",
    label: "Median PNL",
    format: (data) =>
      data.medianPnl !== null ? `${data.medianPnl.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgDuration",
    label: "Avg Dur (min)",
    format: (data) =>
      data.avgDuration !== null ? data.avgDuration.toFixed(1) : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgWinDuration",
    label: "Avg Win Dur",
    format: (data) =>
      data.avgWinDuration !== null ? data.avgWinDuration.toFixed(1) : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgLossDuration",
    label: "Avg Loss Dur",
    format: (data) =>
      data.avgLossDuration !== null ? data.avgLossDuration.toFixed(1) : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgConsecutiveWinPnl",
    label: "Avg Win Streak PNL",
    format: (data) =>
      data.avgConsecutiveWinPnl !== null
        ? `${data.avgConsecutiveWinPnl.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "avgConsecutiveLossPnl",
    label: "Avg Loss Streak PNL",
    format: (data) =>
      data.avgConsecutiveLossPnl !== null
        ? `${data.avgConsecutiveLossPnl.toFixed(2)}%`
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "trend",
    label: "Trend",
    format: (data) => data.trend ?? "N/A",
    isVisible: () => true,
  },
  {
    key: "trendStrength",
    label: "Trend %/d",
    format: (data) =>
      data.trendStrength !== null ? `${data.trendStrength.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "trendConfidence",
    label: "Trend R²",
    format: (data) =>
      data.trendConfidence !== null ? data.trendConfidence.toFixed(3) : "N/A",
    isVisible: () => true,
  },
  {
    key: "buyerPressure",
    label: "Buyer Pres",
    format: (data) =>
      data.buyerPressure !== null
        ? (data.buyerPressure * 100).toFixed(1) + "%"
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "sellerPressure",
    label: "Seller Pres",
    format: (data) =>
      data.sellerPressure !== null
        ? (data.sellerPressure * 100).toFixed(1) + "%"
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "buyerStrength",
    label: "Buyer Str",
    format: (data) =>
      data.buyerStrength !== null
        ? (data.buyerStrength * 100).toFixed(1) + "%"
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "sellerStrength",
    label: "Seller Str",
    format: (data) =>
      data.sellerStrength !== null
        ? (data.sellerStrength * 100).toFixed(1) + "%"
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "pressureImbalance",
    label: "Pres Imb",
    format: (data) =>
      data.pressureImbalance !== null
        ? (data.pressureImbalance > 0 ? "+" : "") +
          data.pressureImbalance.toFixed(3)
        : "N/A",
    isVisible: () => true,
  },
  {
    key: "medianStepSize",
    label: "Median Step",
    format: (data) =>
      data.medianStepSize !== null ? `${data.medianStepSize.toFixed(2)}%` : "N/A",
    isVisible: () => true,
  },
  {
    key: "sortinoRatio",
    label: "Sortino",
    format: (data) =>
      data.sortinoRatio !== null ? data.sortinoRatio.toFixed(3) : "N/A",
    isVisible: () => true,
  },
  {
    key: "calmarRatio",
    label: "Calmar",
    format: (data) =>
      data.calmarRatio !== null ? data.calmarRatio.toFixed(3) : "N/A",
    isVisible: () => true,
  },
  {
    key: "recoveryFactor",
    label: "Recovery",
    format: (data) =>
      data.recoveryFactor !== null ? data.recoveryFactor.toFixed(3) : "N/A",
    isVisible: () => true,
  },
];
