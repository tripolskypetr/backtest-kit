import { memoize, sleep, str } from "functools-kit";
import Binance, { OCOOrder } from "node-binance-api";
import { roundTicks } from "../utils/roundTicks";
import COMMIT_BUY_FN from "./commit_buy.function";
import FETCH_BALANCE_FN from "./fetch_balance.function";
import getCoinName from "../utils/getCoinName";
import { percentValue } from "../utils/percentValue";

const STOP_LOSS_LOWER_PERCENT = 0.999;
const TAKE_PROFIT_UPPER_PERCENT = 1.001;

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

const getBalance = async (binance: Binance) => {
  const account = await binance.account();
  const usdtBalance = account.balances.find(
    (balance) => balance.asset === "USDT"
  );
  if (!usdtBalance) {
    return 0;
  }
  return parseFloat(usdtBalance.free);
};

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

const orderOco = async (
  dto: {
    symbol: string;
    quantity: number;
    takeProfitPrice: number;
    stopLossPrice: number;
  },
  binance: Binance
) => {
  const params = {
    // below order (stop loss)
    belowType: "STOP_LOSS_LIMIT",
    belowPrice: Number(
      await formatPrice(
        dto.symbol,
        dto.stopLossPrice * STOP_LOSS_LOWER_PERCENT,
        binance
      )
    ),
    belowStopPrice: Number(
      await formatPrice(dto.symbol, dto.stopLossPrice, binance)
    ),
    belowTimeInForce: "GTC",

    // above order (take profit)
    aboveType: "TAKE_PROFIT_LIMIT",
    aboveStopPrice: Number(
      await formatPrice(dto.symbol, dto.takeProfitPrice, binance)
    ),
    abovePrice: Number(
      await formatPrice(
        dto.symbol,
        dto.takeProfitPrice * TAKE_PROFIT_UPPER_PERCENT,
        binance
      )
    ),
    aboveTimeInForce: "GTC",
  };

  const qty = Number(await formatQuantity(dto.symbol, dto.quantity, binance));

  console.log("Sending OCO order...", { symbol: dto.symbol, params, qty });

  return await binance.ocoOrder("SELL", dto.symbol, qty, params);
};

interface IParams {
  amountUSDT: number;
  averagePrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  symbol: string;
}

export const COMMIT_TRADE_FN = async (
  { amountUSDT, averagePrice, takeProfitPrice, stopLossPrice, symbol }: IParams,
  binance: Binance
) => {
  const { length: hasOrders } = await binance.openOrders(symbol);
  if (hasOrders) {
    return 0;
  }

  const balance = await getBalance(binance);

  if (balance < amountUSDT) {
    return 0;
  }

  const coinName = getCoinName(symbol);

  const { minQty } = await getExchangeInfo(symbol, "LOT_SIZE", binance);

  if (!minQty) {
    throw new Error(
      `Can't fetch minimal quantity (cancelation) for ${coinName}`
    );
  }

  const ballanceBeforeMap = await FETCH_BALANCE_FN(binance);
  const balanceBefore = ballanceBeforeMap[coinName];

  if (!balanceBefore) {
    throw new Error(`Can't fetch ballance (Before) for ${coinName}`);
  }

  const currentPrice = await COMMIT_BUY_FN(
    {
      amountUSDT,
      averagePrice,
      symbol,
    },
    binance
  );

  const balanceAfterMap = await FETCH_BALANCE_FN(binance);
  const balanceAfter = balanceAfterMap[coinName];

  if (!balanceAfter) {
    throw new Error(`Can't fetch ballance (After) for ${coinName}`);
  }

  const { maker } = await getTransactionFee(symbol, binance);

  let orderQuantity: number;

  {
    orderQuantity = balanceAfter.quantity - balanceBefore.quantity;
    orderQuantity = orderQuantity - percentValue(orderQuantity, maker);
    orderQuantity = orderQuantity - minQty;
  }

  let orderStatus: OCOOrder = null;

  if (
    !Number.isFinite(orderQuantity) ||
    Number.isNaN(orderQuantity) ||
    orderQuantity <= 0
  ) {
    throw new Error(
      `Invalid balance after buy orderQuantity=${orderQuantity} symbol=${symbol}`
    );
  }

  // Создание OCO ордера через binance-api-node
  await sleep(1_000);

  console.log("Creating OCO order with params:", {
    symbol,
    quantity: orderQuantity,
    takeProfitPrice,
    stopLossPrice,
  });

  orderStatus = await orderOco(
    {
      symbol,
      quantity: orderQuantity,
      takeProfitPrice,
      stopLossPrice,
    },
    binance
  );

  {
    let error;
    for (let i = 0; i !== 10; i++) {
      try {
        await sleep(1_000);
        const orders = await binance.openOrders(symbol);
        const { length: hasOrders } = orders;
        if (!hasOrders) {
          error = new Error(
            "Order not created\n" + JSON.stringify(orderStatus, null, 2)
          );
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

  const date = new Date().toLocaleDateString();
  const time = new Date().toLocaleTimeString();

  const report = str.newline(
    `Бот купил ${symbol} (в размере ${await formatQuantity(symbol, orderQuantity, binance)}) по цене ${await formatPrice(symbol, currentPrice, binance)} (${(orderQuantity * currentPrice).toFixed(2)}$)`,
    `и выставил OCO ордер (take profit + stop loss):`,
    `- Take Profit: ${await formatPrice(symbol, takeProfitPrice, binance)} (${(Number(orderQuantity) * Number(takeProfitPrice)).toFixed(2)}$)`,
    `- Stop Loss: ${await formatPrice(symbol, stopLossPrice, binance)} (${(Number(orderQuantity) * Number(stopLossPrice)).toFixed(2)}$)`,
    `Дата/время: ${date} ${time}`
  );
  return {
    status: "ok",
    content: report,
  };
};

export default COMMIT_TRADE_FN;
