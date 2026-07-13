import BaseCRUD from "../../common/BaseCRUD";
import { ILogRow, LogModel } from "../../../schema/Log.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import LogCacheService from "../cache/LogCacheService";
import { ILogEntry } from "backtest-kit";

const LIST_LIMIT = 200;

export class LogDbService extends BaseCRUD(LogModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly logCacheService = inject<LogCacheService>(TYPES.logCacheService);

  public upsert = async (entryId: string, payload: ILogEntry): Promise<void> => {
    this.loggerService.log("logDbService upsert", { entryId });
    const repo = await this.repo<ILogRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ entryId, payload })
      .orUpdate(["payload"], ["entryId"])
      .returning("*")
      .execute();
    const result = raw[0] as ILogRow;
    await this.logCacheService.setLogId(result);
  };

  public findByEntryId = async (entryId: string): Promise<ILogRow | null> => {
    this.loggerService.log("logDbService findByEntryId", { entryId });
    const cachedId = await this.logCacheService.getLogId(entryId);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as ILogRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ entryId }) as ILogRow | null;
    if (result) {
      await this.logCacheService.setLogId(result);
    }
    return result;
  };

  public listAll = async (): Promise<ILogRow[]> => {
    this.loggerService.log("logDbService listAll");
    return await super.findAll({}, LIST_LIMIT, { createDate: "DESC" }) as ILogRow[];
  };
}

export default LogDbService;
