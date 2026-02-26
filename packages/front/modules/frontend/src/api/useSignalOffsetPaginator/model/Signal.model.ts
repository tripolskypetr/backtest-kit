export interface ISignal {
    id: string;
    symbol: string;
    position: string;
    profitLossPercentage: number;
    takeProfitPrice: number;
    originalTakeProfitPrice: number;
    stopLossPrice: number;
    originalStopLossPrice: number;
    buyPrice: number;
    originalBuyPrice: number;
    totalEntries: number;
    quantity: number;
    date: string;
    status: "finished" | "pending";
}
