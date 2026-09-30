import { lib } from "tradeforge";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";

type ExchangeName = string;
type StrategyName = string;
type FrameName = string;

export class PriceConnectionService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getSignalPendingPrice = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ) => {
    this.loggerService.log("priceConnectionService getSignalPendingPrice", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });

    return await lib.priceMetaService.getCurrentPrice(
      symbol,
      { strategyName, exchangeName, frameName },
      backtest,
    );
  };
}

export default PriceConnectionService;
