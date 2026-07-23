import { log } from "pinolog";
import { getMomentStamp, fromMomentStamp } from "get-moment-stamp";
import FETCH_ORDERS_FN from "./fetch_orders.function";
import Binance from "node-binance-api";
import { roundTicks } from "../utils/roundTicks";
import { memoize } from "functools-kit";

interface IDailyPnL {
  date: string;
  pnl: string;
  walletCost: string;
  amountQty: string;
  amountUSDT: string;
  averagePrice: string;
}

type OrderData = Awaited<ReturnType<typeof FETCH_ORDERS_FN>>;

const getAvgPriceForDay = async (
  dto: {
    symbol: string;
    date: Date;
  },
  binance: Binance
) => {
  // Convert date to timestamps (start and end of day)
  const startTime = new Date(dto.date).getTime();
  const endTime = startTime + 24 * 60 * 60 * 1000 - 1;

  const klines = await binance.candles(dto.symbol, "1h", {
    startTime: startTime,
    endTime: endTime,
  });

  // Calculate volume weighted average price (VWAP)
  let totalValue = 0;
  let totalVolume = 0;

  klines.forEach((kline) => {
    const closePrice = parseFloat(kline.close);
    const volume = parseFloat(kline.volume);
    totalValue += closePrice * volume;
    totalVolume += volume;
  });

  const vwap = totalVolume > 0 ? totalValue / totalVolume : 0;
  return vwap;
};

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

const formatPrice = async (symbol: string, price: number, binance: Binance) => {
  const { tickSize } = await getExchangeInfo(symbol, "PRICE_FILTER", binance);
  return roundTicks(price, tickSize);
};

const formatQuantity = async (
  symbol: string,
  quantity: number,
  binance: Binance
) => {
  const { stepSize } = await getExchangeInfo(symbol, "LOT_SIZE", binance);
  return roundTicks(quantity, stepSize);
};

interface ProcessedOrder {
  orderId: number;
  timeMs: number;
  price: number;
  qty: number;
  time: string;
  side: "BUY" | "SELL";
}

const processPartialMatching = (
  buys: ProcessedOrder[],
  sells: ProcessedOrder[],
  pnlByDay: Map<number, number>,
  totalCostByDay: Map<number, number>,
  totalQtyByDay: Map<number, number>
) => {
  const usedSells = new Map<number, number>(); // orderId -> remainingQty

  for (const buy of buys) {
    let remainingBuyQty = buy.qty;

    for (const sell of sells) {
      if (remainingBuyQty <= 0) break;
      if (sell.timeMs <= buy.timeMs) continue;

      const sellRemainingQty = usedSells.get(sell.orderId) ?? sell.qty;
      if (sellRemainingQty <= 0) continue;

      const tradeQty = Math.min(remainingBuyQty, sellRemainingQty);
      const pnl = (sell.price - buy.price) * tradeQty;
      const dayStamp = getMomentStamp(new Date(sell.time));

      pnlByDay.set(dayStamp, (pnlByDay.get(dayStamp) || 0) + pnl);

      // Track average cost calculation
      const existingCost = totalCostByDay.get(dayStamp) || 0;
      const existingQty = totalQtyByDay.get(dayStamp) || 0;

      totalCostByDay.set(dayStamp, existingCost + buy.price * tradeQty);
      totalQtyByDay.set(dayStamp, existingQty + tradeQty);

      remainingBuyQty -= tradeQty;
      usedSells.set(sell.orderId, sellRemainingQty - tradeQty);
    }
  }
};

export const FETCH_PNL_FN = async (
  dto: {
    orders: OrderData;
    symbol: string;
  },
  binance: Binance
): Promise<IDailyPnL[]> => {
  const filledOrders = dto.orders.filter((order) => order.status === "FILLED");

  // Group by days for optimization while supporting partial fills
  const dayGroups = new Map<
    number,
    { buys: ProcessedOrder[]; sells: ProcessedOrder[] }
  >();

  for (const order of filledOrders) {
    const dayStamp = getMomentStamp(new Date(order.time));
    if (!dayGroups.has(dayStamp)) {
      dayGroups.set(dayStamp, { buys: [], sells: [] });
    }

    const group = dayGroups.get(dayStamp)!;
    const orderData: ProcessedOrder = {
      orderId: order.orderId,
      timeMs: new Date(order.time).getTime(),
      price: parseFloat(order.price),
      qty: parseFloat(order.executedQty),
      time: order.time,
      side: order.side,
    };

    if (order.side === "BUY") {
      group.buys.push(orderData);
    }
    
    if (order.side === "SELL") {
      group.sells.push(orderData);
    }
  }

  const pnlByDay = new Map<number, number>();
  const totalCostByDay = new Map<number, number>();
  const totalQtyByDay = new Map<number, number>();
  const balanceByDay = new Map<number, number>();

  // Calculate cumulative balance from all orders chronologically
  const sortedOrders = filledOrders.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  let cumulativeBalance = 0;

  for (const order of sortedOrders) {
    const dayStamp = getMomentStamp(new Date(order.time));
    const qty = parseFloat(order.executedQty);

    if (order.side === "BUY") {
      cumulativeBalance += qty;
    } else if (order.side === "SELL") {
      // Ensure we don't go below zero (protection against invalid data)
      cumulativeBalance = Math.max(0, cumulativeBalance - qty);
    }

    // Only store positive or zero balance
    balanceByDay.set(dayStamp, Math.max(0, cumulativeBalance));
  }

  // Process days with cross-day trade support
  const dayStamps = Array.from(dayGroups.keys()).sort();

  for (let i = 0; i < dayStamps.length; i++) {
    const currentDay = dayStamps[i];
    const currentGroup = dayGroups.get(currentDay)!;

    // Include BUY from current day and SELL from current + future days
    const allBuys = [...currentGroup.buys];
    const allSells = [
      ...currentGroup.sells,
      // Add SELL from future days for cross-day trades
      ...dayStamps
        .slice(i + 1)
        .flatMap((day) => dayGroups.get(day)?.sells || []),
    ];

    // Sort once per processing window
    allBuys.sort((a, b) => a.timeMs - b.timeMs);
    allSells.sort((a, b) => a.timeMs - b.timeMs);

    // Process with partial fill support
    processPartialMatching(
      allBuys,
      allSells,
      pnlByDay,
      totalCostByDay,
      totalQtyByDay
    );
  }

  const itemList = await Promise.all(
    Array.from(pnlByDay.entries())
      .sort(([a], [b]) => b - a)
      .map(async ([momentStamp, pnl]) => {
        const totalCost = totalCostByDay.get(momentStamp) || 0;
        const totalQty = totalQtyByDay.get(momentStamp) || 0;
        const walletCost = totalQty > 0 ? totalCost / totalQty : 0;
        const amountQty = balanceByDay.get(momentStamp) || 0;

        const dayDate = fromMomentStamp(momentStamp);
        const averagePrice = await getAvgPriceForDay(
          { symbol: dto.symbol, date: dayDate },
          binance
        );

        const amountUSDT = amountQty * averagePrice;

        return {
          date: dayDate.toISOString(),
          pnl: await formatPrice(dto.symbol, pnl, binance),
          walletCost: await formatPrice(dto.symbol, walletCost, binance),
          amountQty: await formatQuantity(dto.symbol, amountQty, binance),
          amountUSDT: await formatPrice(dto.symbol, amountUSDT, binance),
          averagePrice: await formatPrice(dto.symbol, averagePrice, binance),
        };
      })
  );

  return itemList;
};

export { IDailyPnL };

export default FETCH_PNL_FN;
