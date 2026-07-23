import {
  execpool,
  iterateDocuments,
  resolveDocuments,
  sleep,
} from "functools-kit";
import Binance, { MyTrade } from "node-binance-api";

interface IParams {
  symbol: string;
  limit: number;
}

interface IOrderData {
  symbol: string;
  orderId: number;
  status: "FILLED" | "CANCELED" | "NEW";
  amount: string;
  executedQty: string;
  price: string;
  time: string;
  side: "BUY" | "SELL";
}

async function* iterateFinished(
  dto: {
    symbol: string;
    limit: number;
  },
  binance: Binance
) {
  const seen = new Set<number>();
  let limit = dto.limit;
  for await (const orders of iterateDocuments<MyTrade>({
    async createRequest({ limit, offset }) {
      const orders = await binance.trades(dto.symbol, {
        limit: limit + offset,
      });
      orders.sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      return orders.slice(-limit);
    },
    limit: dto.limit,
  })) {
    for (const order of orders) {
      if (seen.has(order.orderId)) {
        continue;
      }
      if (limit > 0) {
        seen.add(order.orderId);
        limit -= 1;
        yield order;
        continue;
      }
    }
    if (limit === 0) {
      break;
    }
  }
}

export const FETCH_ORDERS_FN = async (
  { symbol, limit }: IParams,
  binance: Binance
): Promise<IOrderData[]> => {
  const finished = await resolveDocuments(
    iterateFinished(
      {
        symbol,
        limit,
      },
      binance
    )
  );
  const getOrderInfo = execpool(async (orderId: number) => {
    const [order] = await Promise.all([
      binance.orderStatus(symbol, orderId),
      sleep(100),
    ]);
    return order;
  });
  finished.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );
  const finishedOrders: IOrderData[] = await Promise.all(
    finished.map(async (trade) => {
      const { status, origQty, executedQty } = await getOrderInfo(
        trade.orderId
      );
      return {
        symbol: trade.symbol,
        orderId: trade.orderId,
        status: status as "FILLED" | "CANCELED" | "NEW",
        amount: origQty as string,
        executedQty: executedQty as string,
        price: trade.price,
        time: new Date(trade.time).toISOString(),
        side: trade.isBuyer ? "BUY" : "SELL",
      };
    })
  );

  const pending = await binance.openOrders(symbol);

  pending.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );

  const pendingOrders = pending.map((trade) => ({
    symbol: trade.symbol,
    orderId: trade.orderId,
    status: trade.status as "FILLED" | "CANCELED" | "NEW",
    amount: trade.origQty as string,
    executedQty: trade.executedQty as string,
    price: trade.price,
    time: new Date(trade.time).toISOString(),
    side: trade.side,
  }));

  return [...pendingOrders, ...finishedOrders];
};

export { IOrderData };

export default FETCH_ORDERS_FN;
