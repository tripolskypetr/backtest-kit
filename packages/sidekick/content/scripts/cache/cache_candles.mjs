import { addExchangeSchema, warmCandles } from "backtest-kit";
import { singleshot } from "functools-kit";
import ccxt from "ccxt";


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

const from = new Date("2024-02-01T00:00:00Z");
const to = new Date("2024-02-29T23:59:59Z");
const symbol = "BTCUSDT";
const exchangeName = "ccxt-exchange";

await warmCandles({ exchangeName, from, to, interval: "1m", symbol });
await warmCandles({ exchangeName, from, to, interval: "15m", symbol });
await warmCandles({ exchangeName, from, to, interval: "4h", symbol });
