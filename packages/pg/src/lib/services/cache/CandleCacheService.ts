import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { CandleInterval } from "backtest-kit";
import LoggerService from "../base/LoggerService";
import { ICandleRow } from "../../../schema/Candle.schema";

const REDIS_KEY = "candle_cache";

export class CandleCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(symbol: string, interval: CandleInterval, exchangeName: string, timestamp: number): string {
    return `${exchangeName}:${symbol}:${interval}:${timestamp}`;
  }

  public async hasCandleId(symbol: string, interval: CandleInterval, exchangeName: string, timestamp: number) {
    this.loggerService.log("candleCacheService getCandleId", { 
        symbol, 
        interval, 
        exchangeName, 
        timestamp,
    });
    const key = this._cacheKey(symbol, interval, exchangeName, timestamp);
    return await this.has(key);
  }

  public async getCandleId(symbol: string, interval: CandleInterval, exchangeName: string, timestamp: number): Promise<string | null> {
    this.loggerService.log("candleCacheService getCandleId", { 
        symbol, 
        interval, 
        exchangeName, 
        timestamp,
    });
    const key = this._cacheKey(symbol, interval, exchangeName, timestamp);
    const id = <string>await super.get(key);
    return id ?? null;
  }

  public async setCandleId(row: ICandleRow): Promise<string> {
    this.loggerService.log(`candleCacheService setCandleId`, { 
        symbol: row.symbol, 
        interval: row.interval, 
        timestamp: row.timestamp
    });
    const key = this._cacheKey(row.symbol, row.interval, row.exchangeName, row.timestamp);
    await super.set(key, row.id);
    return row.id;
  }
}

export default CandleCacheService;
