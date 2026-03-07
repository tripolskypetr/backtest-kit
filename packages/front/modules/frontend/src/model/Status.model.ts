import { type IPublicSignalRow } from "backtest-kit";

type Partial = {
    type: "profit" | "loss";
    percent: number;
    currentPrice: number;
    costBasisAtClose: number;
    entryCountAtClose: number;
};

type Level = number;

export interface StatusModel {
    position: IPublicSignalRow["position"];
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
    positionLevels: Level[];
    positionPartials: Partial[];
}

export default StatusModel;
