// todo: wrap commit* and signalSync to exchange query before state mutation
// Broker.useAdapter
// Broker.commitPartialProfit/Broker.commitAverageBuy on public api layer before DI query

import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

// Should listen syncSubject automatically cause the new signal is triggered by backtest-kit not the user

export type BrokerClosePendingPayload = {
  symbol: string;
  closeId?: string;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
  };
};

export type BrokerPartialProfitPayload = {
  symbol: string;
  percentToClose: number;
  currentPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
  };
};

export type BrokerPartialLossPayload = {
  symbol: string;
  percentToClose: number;
  currentPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
  };
};

export type BrokerTrailingStopPayload = {
  symbol: string;
  percentShift: number;
  currentPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
  };
};

export type BrokerTrailingTakePayload = {
  symbol: string;
  percentShift: number;
  currentPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
  };
};

export type BrokerBreakevenPayload = {
  symbol: string;
  currentPrice: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
  };
};

export type BrokerAverageBuyPayload = {
  symbol: string;
  currentPrice: number;
  cost: number;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
  };
};

export class BrokerAdapter {
  public commitClosePending = async (payload: BrokerClosePendingPayload) => {};

  public commitPartialProfit = async (payload: BrokerPartialProfitPayload) => {};

  public commitPartialLoss = async (payload: BrokerPartialLossPayload) => {};

  public commitTrailingStop = async (payload: BrokerTrailingStopPayload) => {};

  public commitTrailingTake = async (payload: BrokerTrailingTakePayload) => {};

  public commitBreakeven = async (_payload: BrokerBreakevenPayload) => {};

  public commitAverageBuy = async (_payload: BrokerAverageBuyPayload) => {};
}

export const Broker = new BrokerAdapter();
