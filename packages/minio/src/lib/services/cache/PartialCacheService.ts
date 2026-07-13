import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IPartialRow } from "../../../schema/Partial.schema";

const REDIS_KEY = "partial_cache";

export class PartialCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(symbol: string, strategyName: string, exchangeName: string, signalId: string): string {
    return `${exchangeName}:${strategyName}:${symbol}:${signalId}`;
  }

  public async hasPartialId(symbol: string, strategyName: string, exchangeName: string, signalId: string): Promise<boolean> {
    this.loggerService.log("partialCacheService hasPartialId", { symbol, strategyName, exchangeName, signalId });
    return await this.has(this._cacheKey(symbol, strategyName, exchangeName, signalId));
  }

  public async getPartialId(symbol: string, strategyName: string, exchangeName: string, signalId: string): Promise<string | null> {
    this.loggerService.log("partialCacheService getPartialId", { symbol, strategyName, exchangeName, signalId });
    const id = <string>await super.get(this._cacheKey(symbol, strategyName, exchangeName, signalId));
    return id ?? null;
  }

  public async setPartialId(row: IPartialRow): Promise<string> {
    this.loggerService.log("partialCacheService setPartialId", {
      symbol: row.symbol,
      strategyName: row.strategyName,
      exchangeName: row.exchangeName,
      signalId: row.signalId,
    });
    await super.set(this._cacheKey(row.symbol, row.strategyName, row.exchangeName, row.signalId), row.id);
    return row.id;
  }
}

export default PartialCacheService;
