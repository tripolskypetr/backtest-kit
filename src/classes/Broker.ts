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

export class BrokerUtils {
  public commitSignalClose = async () => {};

  public commitPartialProfit = async (payload: BrokerPartialProfitPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitPartialLoss = async (payload: BrokerPartialLossPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitTrailingStop = async (payload: BrokerTrailingStopPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitTrailingTake = async (payload: BrokerTrailingTakePayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitBreakeven = async (payload: BrokerBreakevenPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitAverageBuy = async (payload: BrokerAverageBuyPayload) => {
    if (payload.backtest) {
      return;
    }
  };
}

export class BrokerAdapter {
  public commitSignalOpen = async (payload: BrokerSignalOpenPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitSignalClose = async (payload: BrokerSignalClosePayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitPartialProfit = async (payload: BrokerPartialProfitPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitPartialLoss = async (payload: BrokerPartialLossPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitTrailingStop = async (payload: BrokerTrailingStopPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitTrailingTake = async (payload: BrokerTrailingTakePayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitBreakeven = async (payload: BrokerBreakevenPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public commitAverageBuy = async (payload: BrokerAverageBuyPayload) => {
    if (payload.backtest) {
      return;
    }
  };

  public enable = singleshot(() => {

    const unSignalOpen = syncSubject
      .filter(({ action }) => action === "signal-open")
      .connect((event) => {
        this.commitSignalOpen({
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
        })
      });

    const unSignalClose = syncSubject
      .filter(({ action }) => action === "signal-close")
      .connect((event) => {
        this.commitSignalClose({
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
        })
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
