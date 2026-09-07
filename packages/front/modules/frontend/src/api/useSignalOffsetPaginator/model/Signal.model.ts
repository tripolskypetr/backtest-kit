export interface ISignal {
    id: string;
    symbol: string;
    position: string;
    profitLossPercentage: number;
    pnlCost: number;
    pnlEntries: number;
    takeProfitPrice: number;
    originalTakeProfitPrice: number;
    stopLossPrice: number;
    originalStopLossPrice: number;
    buyPrice: number;
    originalBuyPrice: number;
    cost: number;
    multiplier: number;
    totalEntries: number;
    totalPartials: number;
    partialExecuted: number;
    date: string;
    status: "finished" | "pending";
}
