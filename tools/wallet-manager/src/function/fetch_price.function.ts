import { memoize, ttl } from "functools-kit";
import Binance from "node-binance-api";
import { roundTicks } from "../utils/roundTicks";
import { get } from "lodash-es";

const PRICE_UPDATE_MS = 30_000;

const getExchangeInfo = memoize(
  ([symbol, filterType]) => `${symbol}-${filterType}`,
  async (symbol: string, filterType = "LOT_SIZE", binance: Binance) => {
    const exchangeInfo = await binance.exchangeInfo();
    const lotSizes = Object.values(exchangeInfo.symbols)
      .map(({ symbol, filters }) => [
        symbol,
        filters.find((f: any) => f.filterType === filterType),
      ])
      .reduce<any>((acm, [k, v]) => ({ ...acm, [k]: v }), {});
    const { stepSize, tickSize, minQty } = lotSizes[symbol];
    return {
      stepSize,
      tickSize,
      minQty,
    };
  }
);

const getTickerInfo = ttl(
  async (binance: Binance) => {
    const ticker = await binance.prices();
    return ticker;
  },
  {
    timeout: PRICE_UPDATE_MS,
  }
);

const formatPrice = async (symbol: string, price: number, binance: Binance) => {
  const { tickSize } = await getExchangeInfo(symbol, "PRICE_FILTER", binance);
  return roundTicks(price, tickSize);
};

const getBinancePrice = async (symbol: string, binance: Binance) => {
  const prices = await binance.prices(symbol);
  const price = prices[symbol];
  return price;
};

const getTickerPrice = async (symbol: string, binance: Binance) => {
    const ticker = await getTickerInfo(binance);
    const price = get(ticker, symbol);
    return parseFloat(price);
};

const getPrice = async (symbol: string, binance: Binance) => {
  const { price } = await binance.avgPrice(symbol);
  return parseFloat(price);
};

interface IParams {
  symbol: string;
}

export const FETCH_PRICE_FN = async ({ symbol }: IParams, binance: Binance) => {
  const averagePrice = await getPrice(symbol, binance);
  const tickPrice = await formatPrice(symbol, averagePrice, binance);
  return Number(tickPrice);
};

export default FETCH_PRICE_FN;
