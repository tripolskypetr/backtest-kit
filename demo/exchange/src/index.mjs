import { addExchangeSchema, Exchange, roundTicks } from "backtest-kit";
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

    return candles.map(([timestamp, open, high, low, close, volume], idx) => ({
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
  getOrderBook: async (symbol, depth, from, to, backtest) => {
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
  getAggregatedTrades: async (symbol, from, to) => {
    const exchange = await getExchange();
    const response = await exchange.publicGetAggTrades({
      symbol,
      startTime: from.getTime(),
      endTime: to.getTime(),
    });
    return response.map((t) => ({
      id: String(t.a),
      price: parseFloat(t.p),
      qty: parseFloat(t.q),
      timestamp: t.T,
      isBuyerMaker: t.m,
    }));
  },
});

console.log(
  await Exchange.getCandles("BTCUSDT", "1m", 5, {
    exchangeName: "ccxt-exchange",
  }),
);
