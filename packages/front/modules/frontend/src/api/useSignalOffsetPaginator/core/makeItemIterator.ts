import { IStorageSignalRow } from "backtest-kit";
import { iteratePromise } from "react-declarative";
import ioc from "../../../lib";
import { ISignal } from "../model/Signal.model";

type OpenedSignal = Extract<IStorageSignalRow, { status: "opened" }>;
type ClosedSignal = Extract<IStorageSignalRow, { status: "closed" }>;

const CC_PERCENT_SLIPPAGE = 0.1;
const CC_PERCENT_FEE = 0.1;

const computeUnrealizedPnl = (
    signal: OpenedSignal,
    priceClose: number,
): number => {
    const { position, priceOpen, _partial } = signal;

    const priceOpenWithSlippage =
        position === "long"
            ? priceOpen * (1 + CC_PERCENT_SLIPPAGE / 100)
            : priceOpen * (1 - CC_PERCENT_SLIPPAGE / 100);

    if (_partial && _partial.length > 0) {
        let totalWeightedPnl = 0;
        let totalFees = CC_PERCENT_FEE;

        for (const partial of _partial) {
            const priceCloseWithSlippage =
                position === "long"
                    ? partial.price * (1 - CC_PERCENT_SLIPPAGE / 100)
                    : partial.price * (1 + CC_PERCENT_SLIPPAGE / 100);

            const partialPnl =
                position === "long"
                    ? ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100
                    : ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100;

            totalWeightedPnl += (partial.percent / 100) * partialPnl;
            totalFees += CC_PERCENT_FEE * (partial.percent / 100) * (priceCloseWithSlippage / priceOpenWithSlippage);
        }

        const totalClosed = _partial.reduce((sum, p) => sum + p.percent, 0);
        const remainingPercent = 100 - totalClosed;

        if (remainingPercent > 0) {
            const priceCloseWithSlippage =
                position === "long"
                    ? priceClose * (1 - CC_PERCENT_SLIPPAGE / 100)
                    : priceClose * (1 + CC_PERCENT_SLIPPAGE / 100);

            const remainingPnl =
                position === "long"
                    ? ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100
                    : ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100;

            totalWeightedPnl += (remainingPercent / 100) * remainingPnl;
            totalFees += CC_PERCENT_FEE * (remainingPercent / 100) * (priceCloseWithSlippage / priceOpenWithSlippage);
        }

        return totalWeightedPnl - totalFees;
    }

    const priceCloseWithSlippage =
        position === "long"
            ? priceClose * (1 - CC_PERCENT_SLIPPAGE / 100)
            : priceClose * (1 + CC_PERCENT_SLIPPAGE / 100);

    const totalFee = CC_PERCENT_FEE * (1 + priceCloseWithSlippage / priceOpenWithSlippage);

    return position === "long"
        ? ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100 - totalFee
        : ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100 - totalFee;
};

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
                    buyPrice: s.pnl.priceOpen,
                    quantity: 0,
                    date: new Date(s.createdAt).toISOString(),
                    status: "finished",
                }),
            );

        if (mode === "backtest") {
          return closed;
        }

        const opened: ISignal[] = await Promise.all(
            all
                .filter((s): s is OpenedSignal => s.status === "opened")
                .map(async (s): Promise<ISignal> => {
                    let profitLossPercentage = 0;
                    try {
                        const currentPrice =
                            await ioc.priceGlobalService.getSignalPendingPrice(
                                s.symbol,
                                s.strategyName,
                                s.exchangeName,
                                s.frameName,
                                false,
                            );
                        profitLossPercentage = computeUnrealizedPnl(
                            s,
                            currentPrice,
                        );
                    } catch {
                        // price not yet available — show 0
                    }
                    return {
                        id: s.id,
                        symbol: s.symbol,
                        position: s.position,
                        takeProfitPrice: s.priceTakeProfit,
                        originalTakeProfitPrice: s.originalPriceTakeProfit,
                        stopLossPrice: s.priceStopLoss,
                        originalStopLossPrice: s.originalPriceStopLoss,
                        profitLossPercentage,
                        buyPrice: s.priceOpen,
                        quantity: 0,
                        date: new Date(s.createdAt).toISOString(),
                        status: "pending",
                    };
                }),
        );

        // opened first (highlighted yellow via rowColor), then closed
        return [...opened, ...closed];
    });

export default makeItemIterator;
