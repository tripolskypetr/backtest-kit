import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import {
  CandleInterval,
  ExchangeName,
  ICandleData,
  IExchange,
} from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import ClientExchange from "../../../client/ClientExchange";
import ExchangeSchemaService from "../schema/ExchangeSchemaService";
import { TMethodContextService } from "../context/MethodContextService";

export class ExchangeConnectionService implements IExchange {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService
  );
  private readonly exchangeSchemaService = inject<ExchangeSchemaService>(
    TYPES.exchangeSchemaService
  );
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );

  public getExchange = memoize(
    (exchangeName) => `${exchangeName}`,
    (exchangeName: ExchangeName) => {
      const { getCandles, formatPrice, formatQuantity, callbacks } =
        this.exchangeSchemaService.get(exchangeName);
      return new ClientExchange({
        execution: this.executionContextService,
        logger: this.loggerService,
        exchangeName,
        getCandles,
        formatPrice,
        formatQuantity,
        callbacks,
      });
    }
  );

  public getCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => {
    this.loggerService.log("exchangeConnectionService getCandles", {
      symbol,
      interval,
      limit,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).getCandles(symbol, interval, limit);
  };

  public getNextCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ): Promise<ICandleData[]> => {
    this.loggerService.log("exchangeConnectionService getNextCandles", {
      symbol,
      interval,
      limit,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).getNextCandles(symbol, interval, limit);
  };

  public getAveragePrice = async (symbol: string) => {
    this.loggerService.log("exchangeConnectionService getAveragePrice", {
      symbol,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).getAveragePrice(symbol);
  };

  public formatPrice = async (symbol: string, price: number) => {
    this.loggerService.log("exchangeConnectionService getAveragePrice", {
      symbol,
      price,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).formatPrice(symbol, price);
  };

  public formatQuantity = async (symbol: string, quantity: number) => {
    this.loggerService.log("exchangeConnectionService getAveragePrice", {
      symbol,
      quantity,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).formatQuantity(symbol, quantity);
  };
}

export default ExchangeConnectionService;
