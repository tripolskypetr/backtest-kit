import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IStrategyRow } from "../../../schema/Strategy.schema";

const REDIS_KEY = "strategy_cache";

export class StrategyCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(symbol: string, strategyName: string, exchangeName: string): string {
    return `${exchangeName}:${strategyName}:${symbol}`;
  }

  public async hasStrategyId(symbol: string, strategyName: string, exchangeName: string): Promise<boolean> {
    this.loggerService.log("strategyCacheService hasStrategyId", { symbol, strategyName, exchangeName });
    return await this.has(this._cacheKey(symbol, strategyName, exchangeName));
  }

  public async getStrategyId(symbol: string, strategyName: string, exchangeName: string): Promise<string | null> {
    this.loggerService.log("strategyCacheService getStrategyId", { symbol, strategyName, exchangeName });
    const id = <string>await super.get(this._cacheKey(symbol, strategyName, exchangeName));
    return id ?? null;
  }

  public async setStrategyId(row: IStrategyRow): Promise<string> {
    this.loggerService.log("strategyCacheService setStrategyId", {
      symbol: row.symbol,
      strategyName: row.strategyName,
      exchangeName: row.exchangeName,
    });
    await super.set(this._cacheKey(row.symbol, row.strategyName, row.exchangeName), row.id);
    return row.id;
  }
}

export default StrategyCacheService;
