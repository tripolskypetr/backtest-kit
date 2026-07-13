import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IStorageRow } from "../../../schema/Storage.schema";

const REDIS_KEY = "storage_cache";

export class StorageCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(backtest: boolean, signalId: string): string {
    return `${backtest ? "backtest" : "live"}:${signalId}`;
  }

  public async hasStorageId(backtest: boolean, signalId: string): Promise<boolean> {
    this.loggerService.log("storageCacheService hasStorageId", { backtest, signalId });
    return await this.has(this._cacheKey(backtest, signalId));
  }

  public async getStorageId(backtest: boolean, signalId: string): Promise<string | null> {
    this.loggerService.log("storageCacheService getStorageId", { backtest, signalId });
    const id = <string>await super.get(this._cacheKey(backtest, signalId));
    return id ?? null;
  }

  public async setStorageId(row: IStorageRow): Promise<string> {
    this.loggerService.log("storageCacheService setStorageId", {
      backtest: row.backtest,
      signalId: row.signalId,
    });
    await super.set(this._cacheKey(row.backtest, row.signalId), row.id);
    return row.id;
  }
}

export default StorageCacheService;
