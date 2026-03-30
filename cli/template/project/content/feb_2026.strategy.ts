import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  listenError,
  Cache,
  Log,
} from "backtest-kit";
import {
  errorData,
  getErrorMessage,
  randomString,
  singleshot,
} from "functools-kit";
import ccxt from "ccxt";
import { run, File, extract } from "@backtest-kit/pinets";
import { outputNode, resolve, sourceNode } from "@backtest-kit/graph";

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: {
      defaultType: "spot",
      adjustForTimeDifference: true,
      recvWindow: 60000,
    },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

const pineSource = sourceNode(
  Cache.fn(
    async (symbol) => {
      const plots = await run(File.fromPath("feb_2026.pine", "../math"), {
        symbol,
        timeframe: "15m",
        limit: 2688,
      });

      return await extract(plots, {
        position: "Position",
        entryPrice: "EntryPrice",
        tp: "TP",
        sl: "SL",
      });
    },
    { interval: "15m", key: ([symbol]) => symbol },
  ),
);

const signalOutput = outputNode(async ([pineSource]) => {
  const position =
    pineSource.position === -1
      ? "short"
      : pineSource.position === 1
        ? "long"
        : "wait";

  if (position === "wait") {
    return null;
  }

  return {
    id: randomString(),
    position,
    priceOpen: pineSource.entryPrice,
    priceTakeProfit: pineSource.tp,
    priceStopLoss: pineSource.sl,
    minuteEstimatedTime: Infinity,
  } as const;
}, pineSource);

addExchangeSchema({
  exchangeName: "ccxt-exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(
      symbol,
      interval,
      since.getTime(),
      limit,
    );
    return candles.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    }));
  },
});

addFrameSchema({
  frameName: "feb_2026_frame",
  interval: "1m",
  startDate: new Date("2026-02-01T00:00:00Z"),
  endDate: new Date("2026-02-28T23:59:59Z"),
  note: "February 2026",
});

addStrategySchema({
  strategyName: "feb_2026_strategy",
  interval: "1m",
  getSignal: async () => await resolve(signalOutput),
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});