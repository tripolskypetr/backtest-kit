// todo: wrap commit* and signalSync to exchange query before state mutation
// Broker.useAdapter
// Broker.commitPartialProfit/Broker.commitAverageBuy on public api layer before DI query

import { compose, singleshot } from "functools-kit";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { IStrategyPnL, StrategyName } from "../interfaces/Strategy.interface";
import { syncSubject } from "../config/emitters";

// Should listen syncSubject automatically cause the new signal is triggered by backtest-kit not the user

export type BrokerSignalOpenPayload = {
  symbol: string;
  cost: number;
  position: "long" | "short";
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  backtest: boolean;
};

export type BrokerSignalClosePayload = {
  symbol: string;
  cost: number;
  position: "long" | "short";
  currentPrice: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  totalEntries: number;
  totalPartials: number;
  pnl: IStrategyPnL;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  backtest: boolean;
};

export type BrokerPartialProfitPayload = {
  symbol: string;
  percentToClose: number;
  cost: number;
  currentPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  backtest: boolean;
};

export type BrokerPartialLossPayload = {
  symbol: string;
  percentToClose: number;
  cost: number;
  currentPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  backtest: boolean;
};

export type BrokerTrailingStopPayload = {
  symbol: string;
  percentShift: number;
  currentPrice: number;
  newStopLossPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  backtest: boolean;
};

export type BrokerTrailingTakePayload = {
  symbol: string;
  percentShift: number;
  currentPrice: number;
  newTakeProfitPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  backtest: boolean;
};

export type BrokerBreakevenPayload = {
  symbol: string;
  currentPrice: number;
  newStopLossPrice: number;
  newTakeProfitPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  backtest: boolean;
};

export type BrokerAverageBuyPayload = {
  symbol: string;
  currentPrice: number;
  cost: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  backtest: boolean;
};

export interface IBroker {
  waitForInit(): Promise<void>;

  onSignalCloseCommit(payload: BrokerSignalClosePayload): Promise<void>;

  onSignalOpenCommit(payload: BrokerSignalOpenPayload): Promise<void>;

  onPartialProfitCommit(payload: BrokerPartialProfitPayload): Promise<void>;

  onPartialLossCommit(payload: BrokerPartialLossPayload): Promise<void>;

  onTrailingStopCommit(payload: BrokerTrailingStopPayload): Promise<void>;

  onTrailingTakeCommit(payload: BrokerTrailingTakePayload): Promise<void>;

  onBreakevenCommit(payload: BrokerBreakevenPayload): Promise<void>;

  onAverageBuyCommit(payload: BrokerAverageBuyPayload): Promise<void>;
}

export type TBrokerCtor = new () => Partial<IBroker>;

export class BrokerProxy implements IBroker {
  constructor(readonly _instance: Partial<IBroker>) {}
  public waitForInit = singleshot(async (): Promise<void> => {
    if (this._instance.waitForInit) {
      await this._instance.waitForInit();
    }
  });
  public async onSignalOpenCommit(
    payload: BrokerSignalOpenPayload,
  ): Promise<void> {
    if (this._instance.onSignalOpenCommit) {
      await this._instance.onSignalOpenCommit(payload);
    }
  }
  public async onSignalCloseCommit(
    payload: BrokerSignalClosePayload,
  ): Promise<void> {
    if (this._instance.onSignalCloseCommit) {
      await this._instance.onSignalCloseCommit(payload);
    }
  }
  public async onPartialProfitCommit(
    payload: BrokerPartialProfitPayload,
  ): Promise<void> {
    if (this._instance.onPartialProfitCommit) {
      await this._instance.onPartialProfitCommit(payload);
    }
  }
  public async onPartialLossCommit(
    payload: BrokerPartialLossPayload,
  ): Promise<void> {
    if (this._instance.onPartialLossCommit) {
      await this._instance.onPartialLossCommit(payload);
    }
  }
  public async onTrailingStopCommit(
    payload: BrokerTrailingStopPayload,
  ): Promise<void> {
    if (this._instance.onTrailingStopCommit) {
      await this._instance.onTrailingStopCommit(payload);
    }
  }
  public async onTrailingTakeCommit(
    payload: BrokerTrailingTakePayload,
  ): Promise<void> {
    if (this._instance.onTrailingTakeCommit) {
      await this._instance.onTrailingTakeCommit(payload);
    }
  }
  public async onBreakevenCommit(
    payload: BrokerBreakevenPayload,
  ): Promise<void> {
    if (this._instance.onBreakevenCommit) {
      await this._instance.onBreakevenCommit(payload);
    }
  }
  public async onAverageBuyCommit(
    payload: BrokerAverageBuyPayload,
  ): Promise<void> {
    if (this._instance.onAverageBuyCommit) {
      await this._instance.onAverageBuyCommit(payload);
    }
  }
}

export class BrokerAdapter {
  private _brokerInstance: BrokerProxy | null = null;

  public commitSignalOpen = async (payload: BrokerSignalOpenPayload) => {
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onSignalOpenCommit(payload);
  };

  public commitSignalClose = async (payload: BrokerSignalClosePayload) => {
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onSignalCloseCommit(payload);
  };

  public commitPartialProfit = async (payload: BrokerPartialProfitPayload) => {
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onPartialProfitCommit(payload);
  };

  public commitPartialLoss = async (payload: BrokerPartialLossPayload) => {
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onPartialLossCommit(payload);
  };

  public commitTrailingStop = async (payload: BrokerTrailingStopPayload) => {
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onTrailingStopCommit(payload);
  };

  public commitTrailingTake = async (payload: BrokerTrailingTakePayload) => {
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onTrailingTakeCommit(payload);
  };

  public commitBreakeven = async (payload: BrokerBreakevenPayload) => {
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onBreakevenCommit(payload);
  };

  public commitAverageBuy = async (payload: BrokerAverageBuyPayload) => {
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    await this._brokerInstance?.onAverageBuyCommit(payload);
  };

  public useBrokerAdapter = (broker: TBrokerCtor | Partial<IBroker>) => {
    if (typeof broker === "function") {
      const instance = Reflect.construct(broker, []);
      this._brokerInstance = new BrokerProxy(instance);
      return;
    }
    this._brokerInstance = new BrokerProxy(broker);
  };

  public enable = singleshot(() => {
    if (!this._brokerInstance) {
      this.enable.clear();
      throw new Error("No broker instance provided. Call Broker.useBrokerAdapter first.");
    }

    const unSignalOpen = syncSubject.subscribe(async (event) => {
      if (event.action !== "signal-open") {
        return;
      }
      await this.commitSignalOpen({
        position: event.signal.position,
        cost: event.signal.cost,
        symbol: event.symbol,
        priceTakeProfit: event.signal.priceTakeProfit,
        priceStopLoss: event.signal.priceStopLoss,
        priceOpen: event.signal.priceOpen,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const unSignalClose = syncSubject.subscribe(async (event) => {
      if (event.action !== "signal-close") {
        return;
      }
      await this.commitSignalClose({
        position: event.signal.position,
        currentPrice: event.currentPrice,
        cost: event.signal.cost,
        symbol: event.symbol,
        pnl: event.pnl,
        totalEntries: event.totalEntries,
        totalPartials: event.totalPartials,
        priceStopLoss: event.signal.priceStopLoss,
        priceTakeProfit: event.signal.priceTakeProfit,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const disposeFn = compose(
      () => unSignalOpen(),
      () => unSignalClose(),
    );

    return () => {
      this.enable.clear();
      disposeFn();
    };
  });

  public disable = () => {
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };
}

export const Broker = new BrokerAdapter();
