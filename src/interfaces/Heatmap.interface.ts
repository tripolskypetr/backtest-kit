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
  /** Profit factor: sum of wins / sum of losses */
  profitFactor: number | null;
  /** Average profit percentage on winning trades */
  avgWin: number | null;
  /** Average loss percentage on losing trades */
  avgLoss: number | null;
  /** Maximum consecutive winning trades */
  maxWinStreak: number;
  /** Maximum consecutive losing trades */
  maxLossStreak: number;
  /** Expectancy: (winRate * avgWin) - (lossRate * avgLoss) */
  expectancy: number | null;
  /** Average peak PNL percentage across all trades (_peak.pnlPercentage). Higher is better. */
  avgPeakPnl: number | null;
  /** Average fall PNL percentage across all trades (_fall.pnlPercentage). Closer to 0 is better. */
  avgFallPnl: number | null;
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
