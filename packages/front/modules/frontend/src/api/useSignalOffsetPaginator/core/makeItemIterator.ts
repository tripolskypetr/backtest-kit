import { IStorageSignalRow } from "backtest-kit";
import { iteratePromise } from "react-declarative";
import ioc from "../../../lib";
import { ISignal } from "../model/Signal.model";

type ClosedSignal = Extract<IStorageSignalRow, { status: "closed" }>;

const makeItemIterator = (mode: "live" | "backtest") =>
    iteratePromise(async (): Promise<ISignal[]> => {
        const all =
            mode === "live"
                ? await ioc.storageViewService.listSignalLive()
                : await ioc.storageViewService.listSignalBacktest();

        return all
            .filter((s): s is ClosedSignal => s.status === "closed")
            .map(
                (s): ISignal => ({
                    id: s.id,
                    symbol: s.symbol,
                    position: s.position,
                    takeProfitPrice: s.priceTakeProfit,
                    originalTakeProfitPrice: s.originalPriceTakeProfit,
                    stopLossPrice: s.priceStopLoss,
                    originalStopLossPrice: s.priceStopLoss,
                    profitLossPercentage: s.pnl.pnlPercentage,
                    buyPrice: s.pnl.priceOpen,
                    quantity: 0,
                    date: new Date(s.createdAt).toISOString(),
                    status: "finished",
                }),
            );
    });

export default makeItemIterator;
