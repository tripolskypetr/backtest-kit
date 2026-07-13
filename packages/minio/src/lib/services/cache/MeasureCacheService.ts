import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IMeasureRow } from "../../../schema/Measure.schema";

const REDIS_KEY = "measure_cache";

export class MeasureCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(bucket: string, entryKey: string): string {
    return `${bucket}:${entryKey}`;
  }

  public async hasMeasureId(bucket: string, entryKey: string): Promise<boolean> {
    this.loggerService.log("measureCacheService hasMeasureId", { bucket, entryKey });
    return await this.has(this._cacheKey(bucket, entryKey));
  }

  public async getMeasureId(bucket: string, entryKey: string): Promise<string | null> {
    this.loggerService.log("measureCacheService getMeasureId", { bucket, entryKey });
    const id = <string>await super.get(this._cacheKey(bucket, entryKey));
    return id ?? null;
  }

  public async setMeasureId(row: IMeasureRow): Promise<string> {
    this.loggerService.log("measureCacheService setMeasureId", { bucket: row.bucket, entryKey: row.entryKey });
    await super.set(this._cacheKey(row.bucket, row.entryKey), row.id);
    return row.id;
  }
}

export default MeasureCacheService;
