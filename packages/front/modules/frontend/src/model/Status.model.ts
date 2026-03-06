import { type IPublicSignalRow } from "backtest-kit";

export interface IStatusOne {
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
    positionLevels: number[];
    positionPartials: IPublicSignalRow["_partial"];
}

export default IStatusOne;
