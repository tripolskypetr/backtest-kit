import { memoize, sleep } from "functools-kit";
import Binance, { Order } from "node-binance-api";
import { roundTicks } from "../utils/roundTicks";
import FETCH_BALANCE_FN from "./fetch_balance.function";
import getCoinName from "../utils/getCoinName";
import COMMIT_SELL_FN from "./commit_sell.function";
import { percentValue } from "../utils/percentValue";

const TRADE_SELL_LOWER_PERCENT = 0.999;

const getTransactionFee = memoize(
  ([symbol]) => `${symbol}`,
  async (_: string, binance: Binance) => {
    const { makerCommission, takerCommission } = await binance.account();
    const maker = makerCommission / 100;
    const taker = takerCommission / 100;
    return { maker, taker };
  }
);

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
  symbol: string;
  averagePrice: number;
}

export const COMMIT_CANCEL_FN = async (
  { symbol, averagePrice }: IParams,
  binance: Binance
) => {
  const coinName = getCoinName(symbol);

  {
    let error;
    for (let i = 0; i !== 10; i++) {
      let isOk = true;
      const orders = await binance.openOrders(symbol);
      for (const order of orders) {
        try {
          await sleep(1_000);
          await binance.cancel(symbol, order.orderId);
          error = null;
        } catch (e) {
          isOk = false;
          error = e;
          continue;
        }
      }
      if (!orders.length) {
        error = null;
        break;
      }
      if (isOk) {
        break;
      }
    }
    if (error) {
      throw error;
    }
  }

  {
    let error;
    for (let i = 0; i !== 10; i++) {
      try {
        await sleep(1_000);
        const { length: hasOrders } = await binance.openOrders(symbol);
        if (hasOrders) {
          error = new Error("Order not canceled");
        } else {
          error = null;
          break;
        }
      } catch (e) {
        error = e;
      }
    }
    if (error) {
      throw error;
    }
  }

  const balanceMap = await FETCH_BALANCE_FN(binance);
  const balance = balanceMap[coinName];

  if (!balance) {
    throw new Error(`Can't fetch ballance (cancelation) for ${coinName}`);
  }

  const { minQty } = await getExchangeInfo(symbol, "LOT_SIZE", binance);

  if (!minQty) {
    throw new Error(
      `Can't fetch minimal quantity (cancelation) for ${coinName}`
    );
  }

  const { maker } = await getTransactionFee(symbol, binance);

  const quantity =
    balance.quantity - percentValue(balance.quantity, maker) - minQty;

  if (quantity <= minQty) {
    return 0;
  }

  const quantity$ = await formatQuantity(symbol, quantity, binance);
  const averagePrice$ = await formatPrice(
    symbol,
    averagePrice * TRADE_SELL_LOWER_PERCENT,
    binance
  );

  const order = await binance.order(
    "LIMIT",
    "SELL",
    symbol,
    Number(quantity$),
    Number(averagePrice$)
  );

  const { orderId, status } = order;

  if (status === "FILLED") {
    return getAveragePrice(order, Number(averagePrice$));
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
      return getAveragePrice(lastStatus, Number(averagePrice$));
    } else {
      return getAveragePrice(lastStatus, Number(averagePrice$));
    }
  }
};

export default COMMIT_CANCEL_FN;
