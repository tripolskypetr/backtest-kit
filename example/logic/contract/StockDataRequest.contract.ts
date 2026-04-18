interface StockDataRequestContract {
    symbol: string;
    date: Date;
    resultId: string;
    limit?: number;
}

export { StockDataRequestContract }
