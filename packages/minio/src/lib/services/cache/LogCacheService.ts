import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { ILogRow } from "../../../schema/Log.schema";

const REDIS_KEY = "log_cache";

export class LogCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public async hasLogId(entryId: string): Promise<boolean> {
    this.loggerService.log("logCacheService hasLogId", { entryId });
    return await this.has(entryId);
  }

  public async getLogId(entryId: string): Promise<string | null> {
    this.loggerService.log("logCacheService getLogId", { entryId });
    const id = <string>await super.get(entryId);
    return id ?? null;
  }

  public async setLogId(row: ILogRow): Promise<string> {
    this.loggerService.log("logCacheService setLogId", { entryId: row.entryId });
    await super.set(row.entryId, row.id);
    return row.id;
  }
}

export default LogCacheService;
