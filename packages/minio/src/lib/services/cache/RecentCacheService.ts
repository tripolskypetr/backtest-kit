import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IRecentRow } from "../../../schema/Recent.schema";

const REDIS_KEY = "recent_cache";

export class RecentCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean): string {
    return `${backtest ? "backtest" : "live"}:${exchangeName}:${strategyName}:${frameName}:${symbol}`;
  }

  public async hasRecentId(symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean): Promise<boolean> {
    this.loggerService.log("recentCacheService hasRecentId", { symbol, strategyName, exchangeName, frameName, backtest });
    return await this.has(this._cacheKey(symbol, strategyName, exchangeName, frameName, backtest));
  }

  public async getRecentId(symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean): Promise<string | null> {
    this.loggerService.log("recentCacheService getRecentId", { symbol, strategyName, exchangeName, frameName, backtest });
    const id = <string>await super.get(this._cacheKey(symbol, strategyName, exchangeName, frameName, backtest));
    return id ?? null;
  }

  public async setRecentId(row: IRecentRow): Promise<string> {
    this.loggerService.log("recentCacheService setRecentId", {
      symbol: row.symbol,
      strategyName: row.strategyName,
      exchangeName: row.exchangeName,
      frameName: row.frameName,
      backtest: row.backtest,
    });
    await super.set(this._cacheKey(row.symbol, row.strategyName, row.exchangeName, row.frameName, row.backtest), row.id);
    return row.id;
  }
}

export default RecentCacheService;
