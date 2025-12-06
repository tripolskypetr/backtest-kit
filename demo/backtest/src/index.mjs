import ccxt from "ccxt";
import {
    addExchange,
    addStrategy,
    addFrame,
    Backtest,
    Partial,
    listenSignalBacktest,
    listenDoneBacktest,
    listenBacktestProgress,
    listenError,
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

addFrame({
    frameName: "test_frame",
    interval: "1m",
    startDate: new Date("2025-12-01T00:00:00.000Z"),
    endDate: new Date("2025-12-01T23:59:59.000Z"),
});

addStrategy({
    strategyName: "test_strategy",
    interval: "5m",
    getSignal: async (symbol) => {

        const messages = await getMessages(symbol);
        
        const resultId = uuid();
        const result = await json(messages);
        await dumpSignal(resultId, messages, result);

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
    await Backtest.dump(event.strategyName);
    await Partial.dump(event.symbol, event.strategyName);
});

listenError((error) => {
    console.error("Error occurred:", error);
});

