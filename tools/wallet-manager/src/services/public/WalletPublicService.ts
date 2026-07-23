import { log } from "pinolog";
import { inject } from "../../core/di";
import WalletPrivateService from "../private/WalletPrivateService";
import { TYPES } from "../../core/types";
import { memoize, queued, singleshot } from "functools-kit";
import getCoinName from "../../utils/getCoinName";
import { IOrderData } from "../../function/fetch_orders.function";
import { IDailyPnL } from "../../function/fetch_pnl";

type MethodName = keyof {
  commitBuy: never;
  commitSell: never;
  commitTrade: never;
  commitCancel: never;
  commitReload: never;
  fetchBalance: never;
  fetchOrders: never;
  fetchPrice: never;
  fetchFiat: never;
  fetchPnl: never;
};

type FetchPriceResult = Awaited<ReturnType<EventListener["fetchPrice"]>>;
type FetchOrdersResult = Awaited<ReturnType<EventListener["fetchOrders"]>>;
type FetchBalanceResult = Awaited<ReturnType<EventListener["fetchBalance"]>>;
type FetchFiatResult = Awaited<ReturnType<EventListener["fetchFiat"]>>;
type FetchPnlResult = Awaited<ReturnType<EventListener["fetchPnl"]>>;
type CommitCancelResult = Awaited<ReturnType<EventListener["commitCancel"]>>;
type CommitReloadResult = Awaited<ReturnType<EventListener["commitReload"]>>;
type CommitTradeResult = Awaited<ReturnType<EventListener["commitTrade"]>>;
type CommitSellResult = Awaited<ReturnType<EventListener["commitSell"]>>;
type CommitBuyResult = Awaited<ReturnType<EventListener["commitBuy"]>>;

class EventListener {
  constructor(readonly walletPrivateService: WalletPrivateService) {}

  private commitBuy = async (
    symbol: string,
    amountUSDT: number,
    averagePrice: number
  ) => {
    log("walletPublicService eventListener commitBuy", {
      symbol,
      amountUSDT,
      averagePrice,
    });
    return await this.walletPrivateService.commitBuy(
      symbol,
      amountUSDT,
      averagePrice
    );
  };

  private commitSell = async (
    symbol: string,
    amountUSDT: number,
    averagePrice: number
  ) => {
    log("walletPublicService eventListener commitSell", {
      symbol,
      amountUSDT,
      averagePrice,
    });
    return await this.walletPrivateService.commitSell(
      symbol,
      amountUSDT,
      averagePrice
    );
  };

  private commitTrade = async (
    symbol: string,
    amountUSDT: number,
    averagePrice: number,
    takeProfitPrice: number,
    stopLossPrice: number
  ) => {
    log("walletPrivateService eventListener commitTrade", {
      symbol,
      amountUSDT,
      averagePrice,
      takeProfitPrice,
      stopLossPrice,
    });
    return await this.walletPrivateService.commitTrade(
      symbol,
      amountUSDT,
      averagePrice,
      takeProfitPrice,
      stopLossPrice
    );
  };

  private commitCancel = async (symbol: string, averagePrice: number) => {
    log("walletPrivateService eventListener commitCancel", {
      symbol,
      averagePrice,
    });
    return await this.walletPrivateService.commitCancel(symbol, averagePrice);
  };

  private commitReload = (symbol: string) => {
    log("walletPrivateService eventListener commitReload", {
      symbol,
    });
    this.walletPrivateService.clear();
    return Promise.resolve();
  };

  private fetchBalance = async (symbol: string) => {
    log("walletPrivateService eventListener fetchBalance", {
      symbol,
    });
    const coinName = getCoinName(symbol);
    const balanceMap = await this.walletPrivateService.fetchBalance();
    const balanceValue = balanceMap[coinName];
    if (!balanceValue) {
      throw new Error(
        `walletPrivateService eventListener fetchBalance failed coinName=${coinName}`
      );
    }
    return balanceValue;
  };

  private fetchOrders = async (symbol: string, limit: number) => {
    log("walletPrivateService eventListener fetchOrders", {
      symbol,
      limit,
    });
    return await this.walletPrivateService.fetchOrders(symbol, limit);
  };

  private fetchPrice = async (symbol: string) => {
    log("walletPrivateService eventListener fetchPrice", {
      symbol,
    });
    return await this.walletPrivateService.fetchPrice(symbol);
  };

  private fetchFiat = async () => {
    log("walletPrivateService eventListener fetchFiat");
    return await this.walletPrivateService.fetchFiat();
  };

  private fetchPnl = async (symbol: string, limit: number) => {
    log("walletPrivateService eventListener fetchPnl", {
      symbol,
      limit,
    });
    return await this.walletPrivateService.fetchPnl(symbol, limit);
  };

  public execute = queued(
    async (symbol: string, methodName: MethodName, ...args: any[]) => {
      const commitFn = singleshot(async () => {
        if (methodName === "commitBuy") {
          const [amountUSDT, averagePrice] = args;
          return await this.commitBuy(symbol, amountUSDT, averagePrice);
        }
        if (methodName === "commitCancel") {
          const [averagePrice] = args;
          return await this.commitCancel(symbol, averagePrice);
        }
        if (methodName === "commitReload") {
          return await this.commitReload(symbol);
        }
        if (methodName === "commitSell") {
          const [amountUSDT, averagePrice] = args;
          return await this.commitSell(symbol, amountUSDT, averagePrice);
        }
        if (methodName === "commitTrade") {
          const [amountUSDT, averagePrice, takeProfitPrice, stopLossPrice] =
            args;
          return await this.commitTrade(
            symbol,
            amountUSDT,
            averagePrice,
            takeProfitPrice,
            stopLossPrice
          );
        }
        if (methodName === "fetchBalance") {
          return await this.fetchBalance(symbol);
        }
        if (methodName === "fetchOrders") {
          const [limit] = args;
          return await this.fetchOrders(symbol, limit);
        }
        if (methodName === "fetchPrice") {
          return await this.fetchPrice(symbol);
        }
        if (methodName === "fetchFiat") {
          return await this.fetchFiat();
        }
        if (methodName === "fetchPnl") {
          const [limit] = args;
          return await this.fetchPnl(symbol, limit);
        }
        throw new Error(
          `walletPrivateService eventListener unknown method methodName=${methodName}`
        );
      });

      await commitFn();
    }
  ) as (
    symbol: string,
    methodName: MethodName,
    ...args: any[]
  ) => Promise<
    | number
    | { content: string }
    | { usdt: number; quantity: number }
    | IOrderData[]
    | IDailyPnL[]
    | void
  >;
}

export class WalletPublicService {
  private readonly walletPrivateService = inject<WalletPrivateService>(
    TYPES.walletPrivateService
  );

  private getRunner = memoize<(symbol: string) => EventListener>(
    ([symbol]) => `${symbol}`,
    () => new EventListener(this.walletPrivateService)
  );

  public commitBuy = async (symbol: string, amountUSDT: number) => {
    log("walletPublicService commitBuy", {
      symbol,
      amountUSDT,
    });
    const averagePrice = await this.walletPrivateService.fetchPrice(symbol);
    {
      if (typeof amountUSDT !== "number" || isNaN(amountUSDT)) {
        throw new Error("amountUSDT must be a valid number");
      }
      if (amountUSDT < 0) {
        throw new Error("amountUSDT must be greater than zero");
      }
    }
    const runner = this.getRunner(symbol);
    let isOk = true;
    try {
      return <CommitBuyResult>(
        await runner.execute(symbol, "commitBuy", amountUSDT, averagePrice)
      );
    } catch (error) {
      isOk = false;
      throw error;
    } finally {
      console.log({
        symbol,
        action: "buy",
        amountUSDT,
        averagePrice,
        date: new Date(),
        status: isOk ? "success" : "failed",
      });
      this.walletPrivateService.clear();
    }
  };

  public commitSell = async (symbol: string, amountUSDT: number) => {
    log("walletPublicService commitSell", {
      symbol,
      amountUSDT,
    });
    const averagePrice = await this.walletPrivateService.fetchPrice(symbol);
    {
      if (typeof amountUSDT !== "number" || isNaN(amountUSDT)) {
        throw new Error("amountUSDT must be a valid number");
      }
      if (amountUSDT < 0) {
        throw new Error("amountUSDT must be greater than zero");
      }
    }
    const runner = this.getRunner(symbol);
    let isOk = true;
    try {
      return <CommitSellResult>(
        await runner.execute(symbol, "commitSell", amountUSDT, averagePrice)
      );
    } catch (error) {
      isOk = false;
      throw error;
    } finally {
      console.log({
        symbol,
        action: "sell",
        amountUSDT,
        averagePrice,
        date: new Date(),
        status: isOk ? "success" : "failed",
      });
      this.walletPrivateService.clear();
    }
  };

  public commitTrade = async (
    symbol: string,
    amountUSDT: number,
    takeProfitPrice: number,
    stopLossPrice: number
  ) => {
    log("walletPrivateService commitTrade", {
      symbol,
      amountUSDT,
      takeProfitPrice,
      stopLossPrice,
    });
    if (stopLossPrice > takeProfitPrice) {
      throw new Error("stop-loss price is greater than take-profit price");
    }
    const averagePrice = await this.walletPrivateService.fetchPrice(symbol);
    {
      if (typeof takeProfitPrice !== "number" || isNaN(takeProfitPrice)) {
        throw new Error("take-profit price must be a valid number");
      }
      if (typeof stopLossPrice !== "number" || isNaN(stopLossPrice)) {
        throw new Error("stop-loss price must be a valid number");
      }
      if (typeof averagePrice !== "number" || isNaN(averagePrice)) {
        throw new Error("average price must be a valid number");
      }
      if (takeProfitPrice <= averagePrice) {
        throw new Error("take-profit price must be greater than average price");
      }
      if (stopLossPrice >= averagePrice) {
        throw new Error("stop-loss price must be less than average price");
      }
      if (stopLossPrice <= 0) {
        throw new Error("stop-loss price must be greater than zero");
      }
      if (takeProfitPrice <= 0) {
        throw new Error("take-profit price must be greater than zero");
      }
    }
    const runner = this.getRunner(symbol);
    let isOk = true;
    try {
      return <CommitTradeResult>(
        await runner.execute(
          symbol,
          "commitTrade",
          amountUSDT,
          averagePrice,
          takeProfitPrice,
          stopLossPrice
        )
      );
    } catch (error) {
      isOk = false;
      throw error;
    } finally {
      console.log({
        symbol,
        action: "trade",
        amountUSDT,
        averagePrice,
        takeProfitPrice,
        stopLossPrice,
        date: new Date(),
        status: isOk ? "success" : "failed",
      });
      this.walletPrivateService.clear();
    }
  };

  public commitCancel = async (symbol: string) => {
    log("walletPrivateService commitCancel", {
      symbol,
    });
    const averagePrice = await this.walletPrivateService.fetchPrice(symbol);
    const runner = this.getRunner(symbol);
    let isOk = true;
    try {
      return <CommitCancelResult>(
        await runner.execute(symbol, "commitCancel", averagePrice)
      );
    } catch (error) {
      isOk = false;
      throw error;
    } finally {
      console.log({
        symbol,
        action: "cancel",
        amountUSDT: 0,
        averagePrice,
        date: new Date(),
        status: isOk ? "success" : "failed",
      });
      this.walletPrivateService.clear();
    }
  };

  public fetchBalance = async (symbol: string) => {
    log("walletPublicService fetchBalance", {
      symbol,
    });
    const runner = this.getRunner(symbol);
    return <FetchBalanceResult>await runner.execute(symbol, "fetchBalance");
  };

  public fetchOrders = async (symbol: string, limit = 25) => {
    log("walletPublicService fetchOrders", {
      symbol,
      limit,
    });
    const runner = this.getRunner(symbol);
    return <FetchOrdersResult>(
      await runner.execute(symbol, "fetchOrders", limit)
    );
  };

  public fetchPrice = async (symbol: string) => {
    log("walletPublicService fetchPrice", {
      symbol,
    });
    const runner = this.getRunner(symbol);
    return <FetchPriceResult>await runner.execute(symbol, "fetchPrice");
  };

  public fetchFiat = async (symbol: string) => {
    log("walletPublicService fetchFiat", {
      symbol,
    });
    const runner = this.getRunner(symbol);
    return <FetchFiatResult>await runner.execute(symbol, "fetchFiat");
  };

  public fetchPnl = async (symbol: string, limit = 25) => {
    log("walletPublicService fetchPnl", {
      symbol,
      limit,
    });
    const runner = this.getRunner(symbol);
    return <FetchPnlResult>await runner.execute(symbol, "fetchPnl", limit);
  };

  public commitReload = async (symbol: string) => {
    log("walletPublicService commitReload", {
      symbol,
    });
    const runner = this.getRunner(symbol);
    return <CommitReloadResult>await runner.execute(symbol, "commitReload");
  };
}

export default WalletPublicService;
