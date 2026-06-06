import { IHeatmapRow } from "../interfaces/Heatmap.interface";

/**
 * Portfolio heatmap statistics structure.
 * Contains aggregated data for all symbols in the portfolio.
 */
export interface HeatmapStatisticsModel {
  /** Array of symbol statistics */
  symbols: IHeatmapRow[];

  /** Total number of symbols tracked */
  totalSymbols: number;

  /** Portfolio-wide total PNL */
  portfolioTotalPnl: number | null;

  /** Portfolio-wide Sharpe Ratio */
  portfolioSharpeRatio: number | null;

  /** Portfolio-wide total trades */
  portfolioTotalTrades: number;

  /** Trade-count-weighted average peak PNL across all symbols. Higher is better. */
  portfolioAvgPeakPnl: number | null;

  /** Trade-count-weighted average fall PNL across all symbols. Closer to 0 is better. */
  portfolioAvgFallPnl: number | null;

  /** Maximum peak PNL across all trades of all symbols (best best-case). Higher is better. */
  portfolioPeakProfitPnl: number | null;

  /** Minimum fall PNL across all trades of all symbols (worst worst-case). Closer to 0 is better. */
  portfolioMaxDrawdownPnl: number | null;

  /** Pooled average trade duration in minutes across all trades of all symbols. */
  portfolioAvgDuration: number | null;

  /** Pooled median pnlPercentage across all trades of all symbols. */
  portfolioMedianPnl: number | null;

  /** Trade-count-weighted mean of per-symbol avgConsecutiveWinPnl. Null if no symbol has a win streak. */
  portfolioAvgConsecutiveWinPnl: number | null;

  /** Trade-count-weighted mean of per-symbol avgConsecutiveLossPnl. Null if no symbol has a loss streak. */
  portfolioAvgConsecutiveLossPnl: number | null;

  /** Pooled average duration in minutes of winning trades. */
  portfolioAvgWinDuration: number | null;

  /** Pooled average duration in minutes of losing trades. */
  portfolioAvgLossDuration: number | null;

  /** Pooled sample standard deviation of returns across all symbols. */
  portfolioStdDev: number | null;

  /** Pooled Sortino Ratio over all trades. Same canonical formula as per-symbol. */
  portfolioSortinoRatio: number | null;

  /** Pooled Calmar Ratio: pooled compound annual / equity drawdown. Capped at ±MAX_CALMAR_RATIO. */
  portfolioCalmarRatio: number | null;

  /** Pooled Recovery Factor: (equityFinal-1)*100 / equityMaxDrawdown. Capped at ±MAX_CALMAR_RATIO. */
  portfolioRecoveryFactor: number | null;

  /** Pooled Expectancy: winProb*avgWin + lossProb*avgLoss (per-trade expected %). */
  portfolioExpectancy: number | null;

  /** Pooled Annualized Sharpe Ratio (portfolioSharpeRatio × √portfolioTradesPerYear). Higher is better. */
  portfolioAnnualizedSharpeRatio: number | null;

  /** Pooled Certainty Ratio (pooledAvgWin / |pooledAvgLoss|). Higher is better. */
  portfolioCertaintyRatio: number | null;

  /** Pooled expected yearly returns (geometric annualization of pooled equity, capped at ±MAX_EXPECTED_YEARLY_RETURNS). */
  portfolioExpectedYearlyReturns: number | null;

  /** Pooled observed trade frequency extrapolated to one year. */
  portfolioTradesPerYear: number | null;
}
