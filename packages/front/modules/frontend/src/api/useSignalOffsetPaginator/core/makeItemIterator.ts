import { IStorageSignalRow } from "backtest-kit";
import { iteratePromise } from "react-declarative";
import ioc from "../../../lib";
import { ISignal } from "../model/Signal.model";

type OpenedSignal = Extract<IStorageSignalRow, { status: "opened" }>;
type ClosedSignal = Extract<IStorageSignalRow, { status: "closed" }>;

const makeItemIterator = (mode: "live" | "backtest") =>
    iteratePromise(async (): Promise<ISignal[]> => {
        const all =
            mode === "live"
                ? await ioc.storageViewService.listSignalLive()
                : await ioc.storageViewService.listSignalBacktest();

        const closed: ISignal[] = all
            .filter((s): s is ClosedSignal => s.status === "closed")
            .map(
                (s): ISignal => ({
                    id: s.id,
                    symbol: s.symbol,
                    position: s.position,
                    takeProfitPrice: s.priceTakeProfit,
                    originalTakeProfitPrice: s.originalPriceTakeProfit,
                    stopLossPrice: s.priceStopLoss,
                    originalStopLossPrice: s.originalPriceStopLoss,
                    profitLossPercentage: s.pnl.pnlPercentage,
                    pnlCost: s.pnl.pnlCost,
                    pnlEntries: s.pnl.pnlEntries,
                    buyPrice: s.priceOpen,
                    originalBuyPrice: s.originalPriceOpen,
                    cost: s.cost,
                    multiplier: s.multiplier,
                    totalEntries: s.totalEntries,
                    totalPartials: s.totalPartials,
                    partialExecuted: s.partialExecuted,
                    date: new Date(s.createdAt).toISOString(),
                    status: "finished",
                }),
            );

        if (mode === "backtest") {
          return closed;
        }

        const opened: ISignal[] = all
            .filter((s): s is OpenedSignal => s.status === "opened")
            .map((s): ISignal => ({
                id: s.id,
                symbol: s.symbol,
                position: s.position,
                takeProfitPrice: s.priceTakeProfit,
                originalTakeProfitPrice: s.originalPriceTakeProfit,
                stopLossPrice: s.priceStopLoss,
                originalStopLossPrice: s.originalPriceStopLoss,
                profitLossPercentage: s.pnl.pnlPercentage,
                pnlCost: s.pnl.pnlCost,
                pnlEntries: s.pnl.pnlEntries,
                buyPrice: s.priceOpen,
                originalBuyPrice: s.originalPriceOpen,
                cost: s.cost,
                multiplier: s.multiplier,
                totalEntries: s.totalEntries,
                totalPartials: s.totalPartials,
                partialExecuted: s.partialExecuted,
                date: new Date(s.createdAt).toISOString(),
                status: "pending",
            }));

        // opened first (highlighted yellow via rowColor), then closed
        return [...opened, ...closed];
    });

export default makeItemIterator;
