import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IStateRow } from "../../../schema/State.schema";

const REDIS_KEY = "state_cache";

export class StateCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(signalId: string, bucketName: string): string {
    return `${signalId}:${bucketName}`;
  }

  public async hasStateId(signalId: string, bucketName: string): Promise<boolean> {
    this.loggerService.log("stateCacheService hasStateId", { signalId, bucketName });
    return await this.has(this._cacheKey(signalId, bucketName));
  }

  public async getStateId(signalId: string, bucketName: string): Promise<string | null> {
    this.loggerService.log("stateCacheService getStateId", { signalId, bucketName });
    const id = <string>await super.get(this._cacheKey(signalId, bucketName));
    return id ?? null;
  }

  public async setStateId(row: IStateRow): Promise<string> {
    this.loggerService.log("stateCacheService setStateId", {
      signalId: row.signalId,
      bucketName: row.bucketName,
    });
    await super.set(this._cacheKey(row.signalId, row.bucketName), row.id);
    return row.id;
  }
}

export default StateCacheService;
