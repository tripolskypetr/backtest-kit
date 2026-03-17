import { type IPublicSignalRow } from "backtest-kit";

type Partial = {
    type: "profit" | "loss";
    percent: number;
    currentPrice: number;
    costBasisAtClose: number;
    entryCountAtClose: number;
    timestamp: number;
};

type Entry = {
    price: number;
    cost: number;
    timestamp: number
};

type Level = number;

export interface StatusModel {
    position: "short" | "long";
    status?: string;
    exchangeName: string;
    symbol: string;
    signalId: string;
    totalEntries: number;
    totalPartials: number;
    originalPriceStopLoss: number;
    originalPriceTakeProfit: number;
    originalPriceOpen: number;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    pnlPercentage: number;
    pnlCost: number;
    pnlEntries: number;
    partialExecuted: number;
    pendingAt: number;
    updatedAt: number;
    timestamp: number;
    minuteEstimatedTime: number;
    positionLevels: Level[];
    positionEntries: Entry[];
    positionPartials: Partial[];
}

export default StatusModel;
