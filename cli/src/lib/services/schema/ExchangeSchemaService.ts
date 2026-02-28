import { singleshot } from "functools-kit";
import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import {
  addExchangeSchema,
  listExchangeSchema,
  roundTicks,
} from "backtest-kit";
import { getExchange } from "../../../config/ccxt";
import ExchangeName from "../../../enum/ExchangeName";

const ADD_EXCHANGE_FN = (self: ExchangeSchemaService) => {
  self.loggerService.log("Adding CCXT Binance as a default exchange schema");
  console.warn("Warning: The default exchange schema is set to CCXT Binance. Please make sure to update it according to your needs using --exchange cli param.");
  addExchangeSchema({
    exchangeName: ExchangeName.DefaultExchange,
    getCandles: async (symbol, interval, since, limit) => {
      const exchange = await getExchange();
      const candles = await exchange.fetchOHLCV(
        symbol,
        interval,
        since.getTime(),
        limit,
      );

      return candles.map(
        ([timestamp, open, high, low, close, volume], idx) => ({
          timestamp,
          open,
          high,
          low,
          close,
          volume,
        }),
      );
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
        throw new Error("Order book fetching is not supported in backtest mode for the default exchange schema. Please implement it according to your needs.");
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
    }
  });
};

export class ExchangeSchemaService {
  public readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public addSchema = singleshot(async () => {
    this.loggerService.log("exchangeSchemaService addSchema");
    const { length } = await listExchangeSchema();
    !length && ADD_EXCHANGE_FN(this);
  });
}

export default ExchangeSchemaService;
