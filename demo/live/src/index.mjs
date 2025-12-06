import ccxt from "ccxt";
import {
    addExchange,
    addStrategy,
    addFrame,
    Live,
    Partial,
    Schedule,
    Constant,
    listenSignalLive,
    listenPartialProfit,
    listenPartialLoss,
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

Live.background("BTCUSDT", {
    strategyName: "test_strategy",
    exchangeName: "test_exchange",
    frameName: "test_frame",
})

listenSignalLive(async (event) => {
    if (event.action === "closed") {
        await Live.dump(event.strategyName);
        await Partial.dump(event.symbol, event.strategyName);
    }
    if (event.action === "scheduled") {
        await Schedule.dump(event.strategyName);
    }
    if (event.action === "cancelled") {
        await Schedule.dump(event.strategyName);
    }
    console.log(event);
});

listenError((error) => {
    console.error("Error occurred:", error);
});

listenPartialProfit(({ symbol, price, level }) => {
  console.log(`${symbol} reached ${level}% profit at ${price}`);
  if (level === Constant.TP_LEVEL3) {
    console.log("Close 33% at 25% profit");
  }
  if (level === Constant.TP_LEVEL2) {
    console.log("Close 33% at 50% profit");
  }
  if (level === Constant.TP_LEVEL1) {
    console.log("Close 34% at 100% profit");
  }
});

listenPartialLoss(({ symbol, price, level }) => {
  console.log(`${symbol} reached -${level}% loss at ${price}`);

  // Scale out at stop levels
  if (level === Constant.SL_LEVEL2) {
    console.log("Close 50% at -50% loss");
  }
  if (level === Constant.SL_LEVEL1) {
    console.log("Close 50% at -100% loss");
  }
});
