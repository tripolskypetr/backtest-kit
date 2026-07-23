import { memoize, sleep } from "functools-kit";
import Binance, { Order } from "node-binance-api";
import { roundTicks } from "../utils/roundTicks";
import { usdToCoins } from "../utils/usdToCoins";

const TRADE_SELL_LOWER_PERCENT = 0.999;

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

const formatQuantity = async (
  symbol: string,
  quantity: number,
  binance: Binance
) => {
  const { stepSize } = await getExchangeInfo(symbol, "LOT_SIZE", binance);
  return roundTicks(quantity, stepSize);
};

const formatPrice = async (symbol: string, price: number, binance: Binance) => {
  const { tickSize } = await getExchangeInfo(symbol, "PRICE_FILTER", binance);
  return roundTicks(price, tickSize);
};

const getAveragePrice = (order: Order, fallbackPrice: number) => {
  const fallback = { price: fallbackPrice };
  const { fills = [fallback] } = order;
  const price = fills.reduce((acm, { price }) => acm + Number(price), 0);
  return price / fills.length;
};

interface IParams {
  amountUSDT: number;
  averagePrice: number;
  symbol: string;
}

export const COMMIT_SELL_FN = async (
  { symbol, averagePrice, amountUSDT }: IParams,
  binance: Binance
) => {
  const orderPrice = await formatPrice(
    symbol,
    averagePrice * TRADE_SELL_LOWER_PERCENT,
    binance
  );

  const quantity = await formatQuantity(
    symbol,
    usdToCoins(amountUSDT, averagePrice),
    binance
  );

  const order = await binance.order(
    "LIMIT",
    "SELL",
    symbol,
    Number(quantity),
    Number(averagePrice)
  );

  const { orderId, status } = order;

  if (status === "FILLED") {
    return getAveragePrice(order, Number(orderPrice));
  } else {
    let isNotClosed = true;
    let lastStatus: Order = null;
    for (let i = 0; i !== 10; i++) {
      await sleep(10_000);
      lastStatus = await binance.orderStatus(symbol, orderId);
      if (lastStatus.status === "FILLED") {
        isNotClosed = false;
        break;
      }
    }
    if (isNotClosed) {
      await binance.cancel(symbol, orderId);
      const orderQty = await formatQuantity(
        symbol,
        Number(quantity) - Number(lastStatus?.executedQty || 0),
        binance
      );
      lastStatus = await binance.marketSell(symbol, Number(orderQty));
      return getAveragePrice(lastStatus, Number(orderPrice));
    } else {
      return getAveragePrice(lastStatus, Number(orderPrice));
    }
  }
};

export default COMMIT_SELL_FN;
