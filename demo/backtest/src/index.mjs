import ccxt from "ccxt";
import {
    addExchange,
    addStrategy,
    addFrame,
    addRisk,
    Backtest,
    Partial,
    Risk,
    listenSignalBacktest,
    listenDoneBacktest,
    listenBacktestProgress,
    listenError,
    listenRisk,
    listenPartialLoss,
    listenPartialProfit,
    dumpSignal,
} from "backtest-kit";
import { v4 as uuid } from "uuid";

import { json } from "./utils/json.mjs";
import { getMessages } from "./utils/messages.mjs";

addExchange({
    exchangeName: "test_exchange",
    getCandles: async (symbol, interval, since, limit) => {
        const exchange = new ccxt.binance();
        const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
        return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
            timestamp, open, high, low, close, volume
        }));
    },
    formatPrice: async (symbol, price) => price.toFixed(2),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
});

addRisk({
    riskName: "demo_risk",
    validations: [
        {
            validate: ({ pendingSignal, currentPrice }) => {
                const { priceOpen = currentPrice, priceTakeProfit, position } = pendingSignal;
                if (!priceOpen) {
                    return;
                }
                // Calculate TP distance percentage
                const tpDistance = position === "long"
                    ? ((priceTakeProfit - priceOpen) / priceOpen) * 100
                    : ((priceOpen - priceTakeProfit) / priceOpen) * 100;

                if (tpDistance < 1) {
                    throw new Error(`TP distance ${tpDistance.toFixed(2)}% < 1%`);
                }
            },
            note: "TP distance must be at least 1%",
        },
        {
            validate: ({ pendingSignal, currentPrice }) => {
                const { priceOpen = currentPrice, priceTakeProfit, priceStopLoss, position } = pendingSignal;
                if (!priceOpen) {
                    return;
                }
                // Calculate reward (TP distance)
                const reward = position === "long"
                    ? priceTakeProfit - priceOpen
                    : priceOpen - priceTakeProfit;
                // Calculate risk (SL distance)
                const risk = position === "long"
                    ? priceOpen - priceStopLoss
                    : priceStopLoss - priceOpen;
                if (risk <= 0) {
                    throw new Error("Invalid SL: risk must be positive");
                }
                const rrRatio = reward / risk;
                if (rrRatio < 2) {
                    throw new Error(`RR ratio ${rrRatio.toFixed(2)} < 2:1`);
                }
            },
            note: "Risk-Reward ratio must be at least 1:2",
        },
    ],
});

addFrame({
    frameName: "test_frame",
    interval: "1m",
    startDate: new Date("2025-12-01T00:00:00.000Z"),
    endDate: new Date("2025-12-01T23:59:59.000Z"),
});

addStrategy({
    strategyName: "test_strategy",
    interval: "5m",
    riskName: "demo_risk",
    getSignal: async (symbol) => {

        const messages = await getMessages(symbol);

        const resultId = uuid();
        const result = await json(messages);
        await dumpSignal(resultId, messages, result);

        result.id = resultId;

        return result;
    },
});

Backtest.background("BTCUSDT", {
    strategyName: "test_strategy",
    exchangeName: "test_exchange",
    frameName: "test_frame",
})

listenSignalBacktest((event) => {
    console.log(event);
});

listenBacktestProgress((event) => {
    console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
    console.log(`Processed: ${event.processedFrames} / ${event.totalFrames}`);
});

listenDoneBacktest(async (event) => {
    console.log("Backtest completed:", event.symbol);
    await Backtest.dump(event.symbol, event.strategyName);
});

listenRisk(async (event) => {
    await Risk.dump(event.symbol, event.strategyName);
});

listenPartialLoss(async (event) => {
    await Partial.dump(event.symbol, event.strategyName);
});

listenPartialProfit(async (event) => {
    await Partial.dump(event.symbol, event.strategyName);
});

listenError((error) => {
    console.error("Error occurred:", error);
});

