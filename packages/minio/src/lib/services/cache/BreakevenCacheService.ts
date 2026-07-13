import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IBreakevenRow } from "../../../schema/Breakeven.schema";

const REDIS_KEY = "breakeven_cache";

export class BreakevenCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(symbol: string, strategyName: string, exchangeName: string, signalId: string): string {
    return `${exchangeName}:${strategyName}:${symbol}:${signalId}`;
  }

  public async hasBreakevenId(symbol: string, strategyName: string, exchangeName: string, signalId: string): Promise<boolean> {
    this.loggerService.log("breakevenCacheService hasBreakevenId", { symbol, strategyName, exchangeName, signalId });
    return await this.has(this._cacheKey(symbol, strategyName, exchangeName, signalId));
  }

  public async getBreakevenId(symbol: string, strategyName: string, exchangeName: string, signalId: string): Promise<string | null> {
    this.loggerService.log("breakevenCacheService getBreakevenId", { symbol, strategyName, exchangeName, signalId });
    const id = <string>await super.get(this._cacheKey(symbol, strategyName, exchangeName, signalId));
    return id ?? null;
  }

  public async setBreakevenId(row: IBreakevenRow): Promise<string> {
    this.loggerService.log("breakevenCacheService setBreakevenId", {
      symbol: row.symbol,
      strategyName: row.strategyName,
      exchangeName: row.exchangeName,
      signalId: row.signalId,
    });
    await super.set(this._cacheKey(row.symbol, row.strategyName, row.exchangeName, row.signalId), row.id);
    return row.id;
  }
}

export default BreakevenCacheService;
