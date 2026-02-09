import { addExchangeSchema } from "backtest-kit";
import { singleshot, randomString } from "functools-kit";
import { run, File, toMarkdown } from "@backtest-kit/pinets";
import ccxt from "ccxt";

const SIGNAL_SCHEMA = {
  allowLong: "AllowLong",
  allowShort: "AllowShort",
  allowBoth: "AllowBoth",
  noTrades: "NoTrades",
  rsi: "RSI",
  adx: "ADX",
  d_MACDLine: "d_MACDLine",
  d_SignalLine: "d_SignalLine",
  d_MACDHist: "d_MACDHist",
  d_DIPlus: "d_DIPlus",
  d_DIMinus: "d_DIMinus",
  d_StrongTrend: "d_StrongTrend",
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
  File.fromPath("timeframe_4h.pine"),
  {
    symbol: "BTCUSDT",
    timeframe: "4h",
    limit: 60,
  },
  "ccxt-exchange",
  new Date("2025-09-23T23:00:00.000Z"),
);

console.log(await toMarkdown(SIGNAL_ID, plots, SIGNAL_SCHEMA));
