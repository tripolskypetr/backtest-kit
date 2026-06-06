/**
 * Portfolio heatmap statistics for a single symbol.
 * Aggregated metrics across all strategies for one trading pair.
 */
export interface IHeatmapRow {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Total profit/loss percentage across all closed trades */
  totalPnl: number | null;
  /** Risk-adjusted return per trade (Sharpe Ratio = avgPnl / stdDev) */
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
  /** Maximum peak PNL percentage observed across all trades (best best-case). Higher is better. */
  peakProfitPnl: number | null;
  /** Minimum fall PNL percentage observed across all trades (worst worst-case). Closer to 0 is better. */
  maxDrawdownPnl: number | null;
  /** Average trade duration in minutes ((closeTimestamp - pendingAt) / 60_000). */
  avgDuration: number | null;
  /** Median pnlPercentage — robust to outliers; reveals distribution skew when paired with avgPnl. */
  medianPnl: number | null;
  /** Average sum of pnlPercentage across consecutive winning streaks. Null if no win streak. */
  avgConsecutiveWinPnl: number | null;
  /** Average sum of pnlPercentage across consecutive losing streaks. Null if no loss streak. Closer to 0 is better. */
  avgConsecutiveLossPnl: number | null;
  /** Average duration in minutes of winning trades. */
  avgWinDuration: number | null;
  /** Average duration in minutes of losing trades. */
  avgLossDuration: number | null;
  /** Sortino Ratio (avgPnl / downside deviation — RMS of losing trades only). Higher is better. */
  sortinoRatio: number | null;
  /** Calmar Ratio (totalPnl / maxDrawdown). Higher is better. */
  calmarRatio: number | null;
  /** Recovery Factor (totalPnl / maxDrawdown). Higher is better. */
  recoveryFactor: number | null;
  /** Annualized Sharpe Ratio (sharpeRatio × √tradesPerYear). Higher is better. */
  annualizedSharpeRatio: number | null;
  /** Certainty Ratio (avgWin / |avgLoss|). Higher is better. */
  certaintyRatio: number | null;
  /** Expected yearly returns (geometric, capped at ±MAX_EXPECTED_YEARLY_RETURNS). Higher is better. */
  expectedYearlyReturns: number | null;
  /** Observed trade frequency extrapolated to one year (signals × 365 / calendarSpanDays). */
  tradesPerYear: number | null;
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
