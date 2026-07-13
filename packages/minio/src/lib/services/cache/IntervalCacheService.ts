import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IIntervalRow } from "../../../schema/Interval.schema";

const REDIS_KEY = "interval_cache";

export class IntervalCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(bucket: string, entryKey: string): string {
    return `${bucket}:${entryKey}`;
  }

  public async hasIntervalId(bucket: string, entryKey: string): Promise<boolean> {
    this.loggerService.log("intervalCacheService hasIntervalId", { bucket, entryKey });
    return await this.has(this._cacheKey(bucket, entryKey));
  }

  public async getIntervalId(bucket: string, entryKey: string): Promise<string | null> {
    this.loggerService.log("intervalCacheService getIntervalId", { bucket, entryKey });
    const id = <string>await super.get(this._cacheKey(bucket, entryKey));
    return id ?? null;
  }

  public async setIntervalId(row: IIntervalRow): Promise<string> {
    this.loggerService.log("intervalCacheService setIntervalId", { bucket: row.bucket, entryKey: row.entryKey });
    await super.set(this._cacheKey(row.bucket, row.entryKey), row.id);
    return row.id;
  }

  public async deleteIntervalId(bucket: string, entryKey: string): Promise<void> {
    this.loggerService.log("intervalCacheService deleteIntervalId", { bucket, entryKey });
    await super.delete(this._cacheKey(bucket, entryKey));
  }
}

export default IntervalCacheService;
