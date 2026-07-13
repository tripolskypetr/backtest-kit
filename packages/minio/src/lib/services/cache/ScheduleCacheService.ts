import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IScheduleRow } from "../../../schema/Schedule.schema";

const REDIS_KEY = "schedule_cache";

export class ScheduleCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(symbol: string, strategyName: string, exchangeName: string): string {
    return `${exchangeName}:${strategyName}:${symbol}`;
  }

  public async hasScheduleId(symbol: string, strategyName: string, exchangeName: string): Promise<boolean> {
    this.loggerService.log("scheduleCacheService hasScheduleId", { symbol, strategyName, exchangeName });
    return await this.has(this._cacheKey(symbol, strategyName, exchangeName));
  }

  public async getScheduleId(symbol: string, strategyName: string, exchangeName: string): Promise<string | null> {
    this.loggerService.log("scheduleCacheService getScheduleId", { symbol, strategyName, exchangeName });
    const id = <string>await super.get(this._cacheKey(symbol, strategyName, exchangeName));
    return id ?? null;
  }

  public async setScheduleId(row: IScheduleRow): Promise<string> {
    this.loggerService.log("scheduleCacheService setScheduleId", {
      symbol: row.symbol,
      strategyName: row.strategyName,
      exchangeName: row.exchangeName,
    });
    await super.set(this._cacheKey(row.symbol, row.strategyName, row.exchangeName), row.id);
    return row.id;
  }
}

export default ScheduleCacheService;
