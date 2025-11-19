import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import {
  CandleInterval,
  ICandle,
} from "../../../interfaces/Candle.interface";
import { memoize } from "functools-kit";
import ClientCandle from "../../../client/ClientCandle";
import CandleSchemaService from "../schema/CandleSchemaService";

export class CandleConnectionService implements ICandle {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService
  );
  private readonly candleSchemaService = inject<CandleSchemaService>(
    TYPES.candleSchemaService
  );

  public getCandle = memoize<(symbol: string) => ClientCandle>(
    (symbol) => `${symbol}`,
    () => {
      const { getCandles, callbacks } = this.candleSchemaService.getSchema();
      return new ClientCandle({
        execution: this.executionContextService,
        logger: this.loggerService,
        getCandles,
        callbacks,
      });
    }
  );

  public getCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => {
    this.loggerService.log("candleConnectionService getCandles", {
      symbol,
      interval,
      limit,
    });
    return await this.getCandle(symbol).getCandles(symbol, interval, limit);
  };

  public getAveragePrice = async (symbol: string) => {
    this.loggerService.log("candleConnectionService getAveragePrice", {
      symbol,
    });
    return await this.getCandle(symbol).getAveragePrice(symbol);
  };
}

export default CandleConnectionService;
