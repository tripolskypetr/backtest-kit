import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { ISignalRowDoc } from "../../../schema/Signal.schema";

const REDIS_KEY = "signal_cache";

export class SignalCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(symbol: string, strategyName: string, exchangeName: string): string {
    return `${exchangeName}:${strategyName}:${symbol}`;
  }

  public async hasSignalId(symbol: string, strategyName: string, exchangeName: string): Promise<boolean> {
    this.loggerService.log("signalCacheService hasSignalId", { symbol, strategyName, exchangeName });
    return await this.has(this._cacheKey(symbol, strategyName, exchangeName));
  }

  public async getSignalId(symbol: string, strategyName: string, exchangeName: string): Promise<string | null> {
    this.loggerService.log("signalCacheService getSignalId", { symbol, strategyName, exchangeName });
    const id = <string>await super.get(this._cacheKey(symbol, strategyName, exchangeName));
    return id ?? null;
  }

  public async setSignalId(row: ISignalRowDoc): Promise<string> {
    this.loggerService.log("signalCacheService setSignalId", {
      symbol: row.symbol,
      strategyName: row.strategyName,
      exchangeName: row.exchangeName,
    });
    await super.set(this._cacheKey(row.symbol, row.strategyName, row.exchangeName), row.id);
    return row.id;
  }
}

export default SignalCacheService;
