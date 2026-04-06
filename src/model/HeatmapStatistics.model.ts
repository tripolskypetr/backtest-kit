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
}
