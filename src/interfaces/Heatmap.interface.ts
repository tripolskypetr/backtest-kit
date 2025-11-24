/**
 * Portfolio heatmap statistics for a single symbol.
 * Aggregated metrics across all strategies for one trading pair.
 */
export interface IHeatmapRow {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Total profit/loss percentage across all closed trades */
  totalPnl: number | null;
  /** Risk-adjusted return (Sharpe Ratio) */
  sharpeRatio: number | null;
  /** Maximum drawdown percentage (largest peak-to-trough decline) */
  maxDrawdown: number | null;
  /** Total number of closed trades */
  totalTrades: number;
  /** Number of winning trades */
  winCount: number;
  /** Number of losing trades */
  lossCount: number;
  /** Win rate percentage */
  winRate: number | null;
  /** Average PNL per trade */
  avgPnl: number | null;
  /** Standard deviation of PNL */
  stdDev: number | null;
}

/**
 * Portfolio heatmap statistics structure.
 * Contains aggregated data for all symbols in the portfolio.
 */
export interface IHeatmapStatistics {
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
}
