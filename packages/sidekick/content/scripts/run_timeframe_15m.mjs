import { addExchangeSchema } from "backtest-kit";
import { singleshot, randomString } from "functools-kit";
import { run, File, toMarkdown } from "@backtest-kit/pinets";
import ccxt from "ccxt";

const SIGNAL_SCHEMA = {
  position: "Signal",
  priceOpen: "Close",
  priceTakeProfit: "TakeProfit",
  priceStopLoss: "StopLoss",
  minuteEstimatedTime: "EstimatedTime",
  d_RSI: "d_RSI",
  d_EmaFast: "d_EmaFast",
  d_EmaSlow: "d_EmaSlow",
  d_EmaTrend: "d_EmaTrend",
  d_ATR: "d_ATR",
  d_Volume: "d_Volume",
  d_VolMA: "d_VolMA",
  d_VolSpike: "d_VolSpike",
  d_Mom: "d_Mom",
  d_MomUp: "d_MomUp",
  d_MomDown: "d_MomDown",
  d_TrendUp: "d_TrendUp",
  d_TrendDown: "d_TrendDown",
  d_LongCond: "d_LongCond",
  d_ShortCond: "d_ShortCond",
  d_BarsSinceSignal: "d_BarsSinceSignal",
};

const SIGNAL_ID = randomString();

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

const plots = await run(
  File.fromPath("timeframe_15m.pine"),
  {
    symbol: "BTCUSDT",
    timeframe: "15m",
    limit: 60,
  },
  "ccxt-exchange",
  new Date("2025-09-23T16:00:00.000Z"),
);

console.log(await toMarkdown(SIGNAL_ID, plots, SIGNAL_SCHEMA));
