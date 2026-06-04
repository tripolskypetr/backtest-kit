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
    symbols: StatusInfoSymbol[];
    backtest: boolean;
}

export default StatusInfoModel;
