import { runInMockContext } from "backtest-kit";

import { forecast } from "../logic";

import { addExchangeSchema, roundTicks } from "backtest-kit";
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

const exchangeName = "ccxt-exchange";

addExchangeSchema({
  exchangeName,
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
  formatPrice: async (symbol, price) => {
    const exchange = await getExchange();
    const market = exchange.market(symbol);
    const tickSize = market.limits?.price?.min || market.precision?.price;
    if (tickSize !== undefined) {
      return roundTicks(price, tickSize);
    }
    return exchange.priceToPrecision(symbol, price);
  },
  formatQuantity: async (symbol, quantity) => {
    const exchange = await getExchange();
    const market = exchange.market(symbol);
    const stepSize = market.limits?.amount?.min || market.precision?.amount;
    if (stepSize !== undefined) {
      return roundTicks(quantity, stepSize);
    }
    return exchange.amountToPrecision(symbol, quantity);
  },
});

const WAIT_DATE = "2026-04-12T21:00:00.000Z"; // 02:00 Ташкент
const BUY_DATE = "2026-04-13T13:00:00.000Z";  // 18:00 Ташкент

const when = new Date(WAIT_DATE);
const symbol = "BTCUSDT";

runInMockContext(async () => {
  console.log(await forecast(symbol, when));
}, {
    when,
    symbol,
    exchangeName,
});
