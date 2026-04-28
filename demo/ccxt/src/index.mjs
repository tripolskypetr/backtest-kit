import { addExchangeSchema, Exchange, roundTicks } from "backtest-kit";
import { singleshot } from "functools-kit";
import * as anomaly from "volume-anomaly";
import * as volatility from "garch";
import ccxt from "ccxt";

const ANOMALY_CONFIDENCE = 0.75; // volume-anomaly composite score
const N_TRAIN = 1200; // baseline count
const N_DETECT = 200; // detection window

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

const getExecutedTradesSkew = async (symbol) => {
  const all = await Exchange.getAggregatedTrades(symbol, {
    exchangeName: "ccxt-exchange",
  }, N_TRAIN + N_DETECT);
  return anomaly.predict(
    all.slice(0, N_TRAIN),
    all.slice(N_TRAIN),
    ANOMALY_CONFIDENCE,
  );
};

const getVolatilityForecast = async (symbol) => {
  const candles_1m = await Exchange.getCandles(symbol, "1m", 1_500, {
    exchangeName: "ccxt-exchange",
  });
  const candles_5m = await Exchange.getCandles(symbol, "5m", 1_500, {
    exchangeName: "ccxt-exchange",
  });
  const candles_15m = await Exchange.getCandles(symbol, "15m", 1_000, {
    exchangeName: "ccxt-exchange",
  });
  const candles_30m = await Exchange.getCandles(symbol, "30m", 1_000, {
    exchangeName: "ccxt-exchange",
  });
  const candles_1h = await Exchange.getCandles(symbol, "1h", 500, {
    exchangeName: "ccxt-exchange",
  });
  const candles_4h = await Exchange.getCandles(symbol, "4h", 500, {
    exchangeName: "ccxt-exchange",
  });
  const candles_6h = await Exchange.getCandles(symbol, "6h", 300, {
    exchangeName: "ccxt-exchange",
  });
  const candles_8h = await Exchange.getCandles(symbol, "8h", 300, {
    exchangeName: "ccxt-exchange",
  });

  const { sigma: sigma_1m, reliable: reliable_1m } = await volatility.predict(candles_1m, "1m");
  const { sigma: sigma_5m, reliable: reliable_5m } = await volatility.predict(candles_5m, "5m");
  const { sigma: sigma_15m, reliable: reliable_15m } = await volatility.predict(candles_15m, "15m");
  const { sigma: sigma_30m, reliable: reliable_30m } = await volatility.predict(candles_30m, "30m");
  const { sigma: sigma_1h, reliable: reliable_1h } = await volatility.predict(candles_1h, "1h");
  const { sigma: sigma_4h, reliable: reliable_4h } = await volatility.predict(candles_4h, "4h");
  const { sigma: sigma_6h, reliable: reliable_6h } = await volatility.predict(candles_6h, "6h");
  const { sigma: sigma_8h, reliable: reliable_8h } = await volatility.predict(candles_8h, "8h");

  const volatility_1m = { sigma_1m, reliable_1m };
  const volatility_5m = { sigma_5m, reliable_5m };
  const volatility_15m = { sigma_15m, reliable_15m };
  const volatility_30m = { sigma_30m, reliable_30m };
  const volatility_1h = { sigma_1h, reliable_1h };
  const volatility_4h = { sigma_4h, reliable_4h };
  const volatility_6h = { sigma_6h, reliable_6h };
  const volatility_8h = { sigma_8h, reliable_8h };

  return {
    volatility_1m,
    volatility_5m,
    volatility_15m,
    volatility_30m,
    volatility_1h,
    volatility_4h,
    volatility_6h,
    volatility_8h,
  };
}

console.log(
  await Exchange.getCandles("BTCUSDT", "1m", 5, {
    exchangeName: "ccxt-exchange",
  }),
);

console.log(
  await getExecutedTradesSkew("BTCUSDT")
);

console.log(
  await getVolatilityForecast("BTCUSDT")
)
