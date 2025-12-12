import ccxt from "ccxt";
import {
    addExchange,
    addStrategy,
    addFrame,
    addRisk,
    Live,
    Partial,
    Schedule,
    Risk,
    Constant,
    listenSignalLive,
    listenPartialProfit,
    listenPartialLoss,
    listenError,
    listenRisk,
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
            validate: ({ pendingSignal }) => {
                const { priceOpen, priceTakeProfit, position } = pendingSignal;
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
            validate: ({ pendingSignal }) => {
                const { priceOpen, priceTakeProfit, priceStopLoss, position } = pendingSignal;
                const reward = position === "long"
                    ? priceTakeProfit - priceOpen
                    : priceOpen - priceTakeProfit;
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

Live.background("BTCUSDT", {
    strategyName: "test_strategy",
    exchangeName: "test_exchange",
    frameName: "test_frame",
})

listenSignalLive(async (event) => {
    if (event.action === "opened") {
        console.log("Open position");
    }
    if (event.action === "closed") {
        console.log("Close position");
    }
    if (event.action === "closed") {
        await Live.dump(event.symbol, event.strategyName);
        await Partial.dump(event.symbol, event.strategyName);
    }
    if (event.action === "scheduled") {
        await Schedule.dump(event.symbol, event.strategyName);
    }
    if (event.action === "cancelled") {
        await Schedule.dump(event.symbol, event.strategyName);
    }
    console.log(event);
});

listenRisk(async (event) => {
    await Risk.dump(event.symbol, event.strategyName);
});

listenError((error) => {
    console.error("Error occurred:", error);
});

listenPartialProfit(({ symbol, price, level }) => {
  console.log(`${symbol} reached ${level}% profit at ${price}`);
  if (level === Constant.TP_LEVEL3) {
    console.log("Close 33% at 90% profit");
  }
  if (level === Constant.TP_LEVEL2) {
    console.log("Close 33% at 60% profit");
  }
  if (level === Constant.TP_LEVEL1) {
    console.log("Close 34% at 30% profit");
  }
});

listenPartialLoss(({ symbol, price, level }) => {
  console.log(`${symbol} reached -${level}% loss at ${price}`);

  // Scale out at stop levels
  if (level === Constant.SL_LEVEL2) {
    console.log("Close 50% at -80% loss");
  }
  if (level === Constant.SL_LEVEL1) {
    console.log("Close 50% at -40% loss");
  }
});
