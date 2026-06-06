type StatusInfoSymbol = {
    symbol: string;
    totalPnl: number | null;
    winRate: number | null;
    profitFactor: number | null;
    maxDrawdown: number | null;
    expectancy: number | null;
    totalTrades: number;
    sortinoRatio: number | null;
    calmarRatio: number | null;
    recoveryFactor: number | null;
    sharpeRatio: number | null;
    annualizedSharpeRatio: number | null;
    certaintyRatio: number | null;
    expectedYearlyReturns: number | null;
    tradesPerYear: number | null;
    avgPnl: number | null;
    stdDev: number | null;
    avgWin: number | null;
    avgLoss: number | null;
    maxWinStreak: number;
    maxLossStreak: number;
    avgPeakPnl: number | null;
    avgFallPnl: number | null;
    peakProfitPnl: number | null;
    maxDrawdownPnl: number | null;
    avgDuration: number | null;
    medianPnl: number | null;
    avgConsecutiveWinPnl: number | null;
    avgConsecutiveLossPnl: number | null;
    avgWinDuration: number | null;
    avgLossDuration: number | null;
};

export interface StatusInfoModel {
    context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    };
    portfolioTotalPnl: number | null;
    portfolioSharpeRatio: number | null;
    portfolioTotalTrades: number;
    portfolioStdDev: number | null;
    portfolioSortinoRatio: number | null;
    portfolioCalmarRatio: number | null;
    portfolioRecoveryFactor: number | null;
    portfolioExpectancy: number | null;
    portfolioAvgPeakPnl: number | null;
    portfolioAvgFallPnl: number | null;
    portfolioPeakProfitPnl: number | null;
    portfolioMaxDrawdownPnl: number | null;
    portfolioAvgDuration: number | null;
    portfolioMedianPnl: number | null;
    portfolioAvgConsecutiveWinPnl: number | null;
    portfolioAvgConsecutiveLossPnl: number | null;
    portfolioAvgWinDuration: number | null;
    portfolioAvgLossDuration: number | null;
    portfolioAnnualizedSharpeRatio: number | null;
    portfolioCertaintyRatio: number | null;
    portfolioExpectedYearlyReturns: number | null;
    portfolioTradesPerYear: number | null;
    symbols: StatusInfoSymbol[];
    backtest: boolean;
}

export default StatusInfoModel;
