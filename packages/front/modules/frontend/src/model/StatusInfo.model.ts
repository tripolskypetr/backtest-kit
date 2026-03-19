type StatusInfoSymbol = {
    symbol: string;
    totalPnl: number | null;
    winRate: number | null;
    profitFactor: number | null;
    maxDrawdown: number | null;
    expectancy: number | null;
    totalTrades: number;
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
    symbols: StatusInfoSymbol[];
    backtest: boolean;
}

export default StatusInfoModel;
