import { singleshot, Source, ttl } from "functools-kit";
import Binance from "node-binance-api";
import { CC_BINANCE_API_KEY, CC_BINANCE_API_SECRET } from "../../config/params";
import COMMIT_BUY_FN from "../../function/commit_buy.function";
import { log } from "pinolog";
import COMMIT_SELL_FN from "../../function/commit_sell.function";
import FETCH_BALANCE_FN from "../../function/fetch_balance.function";
import FETCH_PRICE_FN from "../../function/fetch_price.function";
import COMMIT_TRADE_FN from "../../function/commit_trade.function";
import COMMIT_CANCEL_FN from "../../function/commit_cancel.function";
import FETCH_ORDERS_FN from "../../function/fetch_orders.function";
import FETCH_FIAT_FN from "../../function/fetch_fiat.function";
import FETCH_PNL_FN from "../../function/fetch_pnl";

const WALLET_GC_TTL = 30 * 1_000;

const ORDERS_TTL = 10 * 60 * 1_000;
const PNL_TTL = 10 * 60 * 1_000;
const AVERAGE_PRICE_TTL = 5 * 60 * 1_000;

const getBinance = singleshot(async () => {
  if (!CC_BINANCE_API_KEY) {
    getBinance.clear();
    throw new Error("Binance API KEY is empty");
  }
  if (!CC_BINANCE_API_SECRET) {
    getBinance.clear();
    throw new Error("Binance API SECRET is empty");
  }
  const binance$ = new Binance().options({
    family: 4,
    APIKEY: CC_BINANCE_API_KEY,
    APISECRET: CC_BINANCE_API_SECRET,
    useServerTime: true,
    recvWindow: 60000,
  });
  await binance$.useServerTime();
  Object.assign(globalThis, { binance$ });
  return binance$;
});

export class WalletPrivateService {
  public commitTrade = async (
    symbol: string,
    amountUSDT: number,
    averagePrice: number,
    takeProfitPrice: number,
    stopLossPrice: number
  ) => {
    log("walletPrivateService commitTrade", {
      symbol,
      amountUSDT,
      averagePrice,
      takeProfitPrice,
      stopLossPrice,
    });
    const binance = await getBinance();
    return await COMMIT_TRADE_FN(
      { symbol, averagePrice, amountUSDT, takeProfitPrice, stopLossPrice },
      binance
    );
  };

  public commitCancel = async (symbol: string, averagePrice: number) => {
    log("walletPrivateService commitCancel", {
      symbol,
      averagePrice,
    });
    const binance = await getBinance();
    return await COMMIT_CANCEL_FN({ symbol, averagePrice }, binance);
  };

  public commitBuy = async (
    symbol: string,
    amountUSDT: number,
    averagePrice: number
  ) => {
    log("walletPrivateService commitBuy", {
      symbol,
      amountUSDT,
      averagePrice,
    });
    const binance = await getBinance();
    return await COMMIT_BUY_FN({ symbol, averagePrice, amountUSDT }, binance);
  };

  public commitSell = async (
    symbol: string,
    amountUSDT: number,
    averagePrice: number
  ) => {
    log("walletPrivateService commitSell", {
      symbol,
      amountUSDT,
      averagePrice,
    });
    const binance = await getBinance();
    return await COMMIT_SELL_FN({ symbol, averagePrice, amountUSDT }, binance);
  };

  public fetchBalance = async () => {
    log("walletPrivateService fetchBalance");
    const binance = await getBinance();
    return await FETCH_BALANCE_FN(binance);
  };

  public fetchPrice = async (symbol: string) => {
    log("walletPrivateService fetchPrice", {
      symbol,
    });
    const binance = await getBinance();
    return await FETCH_PRICE_FN({ symbol }, binance);
  };

  public fetchFiat = async () => {
    log("walletPrivateService fetchFiat");
    const binance = await getBinance();
    return await FETCH_FIAT_FN(binance);
  };

  public fetchOrders = ttl(
    async (symbol: string, limit: number) => {
      log("walletPrivateService fetchOrders", {
        symbol,
        limit,
      });
      const binance = await getBinance();
      return await FETCH_ORDERS_FN({ symbol, limit }, binance);
    },
    {
      timeout: ORDERS_TTL,
      key: ([symbol, limit]) => `${symbol}-${limit}`,
    }
  );

  public fetchPnl = ttl(
    async (symbol: string, limit: number) => {
      log("walletPrivateService fetchPnl", {
        symbol,
        limit,
      });
      const binance = await getBinance();
      const orders = await this.fetchOrders(symbol, limit);
      return await FETCH_PNL_FN(
        {
          orders,
          symbol,
        },
        binance
      );
    },
    {
      timeout: PNL_TTL,
      key: ([symbol, limit]) => `${symbol}-${limit}`,
    }
  );

  public clear = () => {
    log("walletPrivateService clear");
    this.fetchPnl.clear();
    this.fetchOrders.clear();
  };

  protected init = singleshot(async () => {
    log("walletPrivateService init");
    if (!CC_BINANCE_API_KEY) {
      return;
    }
    if (!CC_BINANCE_API_SECRET) {
      return;
    }
    Source.fromInterval(WALLET_GC_TTL).connect(() => {
      this.fetchPnl.gc();
      this.fetchOrders.gc();
    });
  });
}

export default WalletPrivateService;
