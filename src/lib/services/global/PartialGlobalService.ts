import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { PartialConnectionService } from "../connection/PartialConnectionService";
import { ISignalRow } from "../../../interfaces/Strategy.interface";

export class PartialGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly partialConnectionService = inject<PartialConnectionService>(
    TYPES.partialConnectionService
  );

  public profit = async (
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    revenuePercent: number,
    backtest: boolean,
    when: Date
  ) => {
    this.loggerService.log("partialGlobalService profit", {
      symbol,
      data,
      currentPrice,
      revenuePercent,
      backtest,
      when,
    });
    return await this.partialConnectionService.profit(
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
    this.loggerService.log("partialGlobalService loss", {
      symbol,
      data,
      currentPrice,
      lossPercent,
      backtest,
      when,
    });
    return await this.partialConnectionService.loss(
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
    this.loggerService.log("partialGlobalService profit", {
      symbol,
      data,
      priceClose,
    });
    return await this.partialConnectionService.clear(symbol, data, priceClose);
  };
}

export default PartialGlobalService;
