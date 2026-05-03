import { addExchangeSchema, addFrameSchema, roundTicks, setConfig } from "backtest-kit";
import { singleshot } from "functools-kit";
import ccxt from "ccxt";

setConfig({
  CC_BREAKEVEN_THRESHOLD: 0.0
})

const MS_PER_MINUTE = 60_000;

const INTERVAL_MINUTES: Record<string, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "1d": 1440,
};

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

    const intervalMinutes = INTERVAL_MINUTES[interval];
    if (!intervalMinutes) {
      throw new Error(`Unknown interval: ${interval}`);
    }

    const intervalMs = intervalMinutes * MS_PER_MINUTE;
    const candleMap = new Map(
      candles.map(([timestamp, open, high, low, close, volume]) => [
        timestamp,
        { timestamp, open, high, low, close, volume }
      ])
    );

    // Заполняем пропущенные свечи
    const result = [];
    let lastCandle = null;

    for (let i = 0; i < limit; i++) {
      const expectedTimestamp = since.getTime() + i * intervalMs;
      let candle = candleMap.get(expectedTimestamp);

      if (!candle && lastCandle) {
        // Заполняем пропущенную свечу последней известной ценой с нулевым объемом
        candle = {
          timestamp: expectedTimestamp,
          open: lastCandle.close,
          high: lastCandle.close,
          low: lastCandle.close,
          close: lastCandle.close,
          volume: 0,
        };
      }

      if (candle) {
        result.push(candle);
        lastCandle = candle;
      }
    }

    return result;
  },
  getOrderBook: async (symbol, depth, _from, _to, backtest) => {
    if (backtest) {
      throw new Error(
        "Order book fetching is not supported in backtest mode for the default exchange schema. Please implement it according to your needs.",
      );
    }
    const exchange = await getExchange();
    const bookData = await exchange.fetchOrderBook(symbol, depth);
    return {
      symbol,
      asks: bookData.asks.map(([price, quantity]) => ({
        price: String(price),
        quantity: String(quantity),
      })),
      bids: bookData.bids.map(([price, quantity]) => ({
        price: String(price),
        quantity: String(quantity),
      })),
    };
  },
  getAggregatedTrades: async (symbol: string, from: Date, to: Date) => {
    const exchange = await getExchange();
    const response = await exchange.publicGetAggTrades({
      symbol,
      startTime: from.getTime(),
      endTime: to.getTime(),
    });
    return response.map((t: any) => ({
      id: String(t.a),
      price: parseFloat(t.p),
      qty: parseFloat(t.q),
      timestamp: t.T,
      isBuyerMaker: t.m,
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

addFrameSchema({
  frameName: "feb_2021_frame",
  interval: "1m",
  startDate: new Date("2021-02-08T00:00:00Z"),
  endDate: new Date("2021-02-18T23:59:59Z"),
});
