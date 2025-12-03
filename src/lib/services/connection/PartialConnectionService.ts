import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ISignalRow } from "../../../interfaces/Strategy.interface";
import { IPartial, PartialLevel } from "../../../interfaces/Partial.interface";
import ClientPartial from "src/client/ClientPartial";
import { memoize } from "functools-kit";
import {
  partialProfitSubject,
  partialLossSubject,
} from "../../../config/emitters";

export class PartialConnectionService implements IPartial {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private getPartial = memoize<(signalId: string) => ClientPartial>(
    ([signalId]) => `${signalId}`,
    () => {
      return new ClientPartial({
        logger: this.loggerService,
        onProfit: async (
          symbol: string,
          data: ISignalRow,
          currentPrice: number,
          level: PartialLevel,
          backtest: boolean,
          timestamp: number
        ) =>
          await partialProfitSubject.next({
            symbol,
            data,
            currentPrice,
            level,
            backtest,
            timestamp,
          }),
        onLoss: async (
          symbol: string,
          data: ISignalRow,
          currentPrice: number,
          level: PartialLevel,
          backtest: boolean,
          timestamp: number
        ) =>
          await partialLossSubject.next({
            symbol,
            data,
            currentPrice,
            level,
            backtest,
            timestamp,
          }),
      });
    }
  );

  public profit = async (
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    revenuePercent: number,
    backtest: boolean,
    when: Date
  ) => {
    this.loggerService.log("partialConnectionService profit", {
      symbol,
      data,
      currentPrice,
      revenuePercent,
      backtest,
      when,
    });
    const partial = this.getPartial(data.id);
    await partial.waitForInit(symbol);
    return await partial.profit(
      symbol,
      data,
      currentPrice,
      revenuePercent,
      backtest,
      when
    );
  };

  public loss = async (
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    lossPercent: number,
    backtest: boolean,
    when: Date
  ) => {
    this.loggerService.log("partialConnectionService loss", {
      symbol,
      data,
      currentPrice,
      lossPercent,
      backtest,
      when,
    });
    const partial = this.getPartial(data.id);
    await partial.waitForInit(symbol);
    return await partial.loss(
      symbol,
      data,
      currentPrice,
      lossPercent,
      backtest,
      when
    );
  };

  public clear = async (
    symbol: string,
    data: ISignalRow,
    priceClose: number
  ) => {
    this.loggerService.log("partialConnectionService profit", {
      symbol,
      data,
      priceClose,
    });
    const partial = this.getPartial(data.id);
    await partial.waitForInit(symbol);
    await partial.clear(symbol, data, priceClose);
    this.getPartial.clear(data.id);
  };
}
