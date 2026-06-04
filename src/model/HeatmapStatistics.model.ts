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
}
