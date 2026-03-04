// todo: wrap commit* and signalSync to exchange query before state mutation
// Broker.useAdapter
// Broker.commitPartialProfit/Broker.commitAverageBuy on public api layer before DI query

import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

// Should listen syncSubject automatically cause the new signal is triggered by backtest-kit not the user

export class BrokerAdapter {

  public commitClosePending = async (_payload: {
    symbol: string;
    closeId?: string;
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    };
  }) => {};

  public commitPartialProfit = async (_payload: {
    symbol: string;
    percentToClose: number;
    currentPrice: number;
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    };
  }) => {};

  public commitPartialLoss = async (_payload: {
    symbol: string;
    percentToClose: number;
    currentPrice: number;
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    };
  }) => {};

  public commitTrailingStop = async (_payload: {
    symbol: string;
    percentShift: number;
    currentPrice: number;
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    };
  }) => {};

  public commitTrailingTake = async (_payload: {
    symbol: string;
    percentShift: number;
    currentPrice: number;
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    };
  }) => {};

  public commitBreakeven = async (_payload: {
    symbol: string;
    currentPrice: number;
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    };
  }) => {};

  public commitAverageBuy = async (_payload: {
    symbol: string;
    currentPrice: number;
    cost: number;
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    };
  }) => {};
}

export const Broker = new BrokerAdapter();
