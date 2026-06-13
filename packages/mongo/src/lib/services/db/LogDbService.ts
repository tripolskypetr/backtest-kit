import BaseCRUD from "../../common/BaseCRUD";
import { ILogRow, LogModel } from "../../../schema/Log.schema";
import { readTransform } from "../../../utils/readTransform";
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
    const filter = { entryId };
    const document = await LogModel.findOneAndUpdate(
      filter,
      { $set: { payload } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as ILogRow;
    await this.logCacheService.setLogId(result);
  };

  public findByEntryId = async (entryId: string): Promise<ILogRow | null> => {
    this.loggerService.log("logDbService findByEntryId", { entryId });
    const cachedId = await this.logCacheService.getLogId(entryId);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as ILogRow | null;
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
    const documents = await LogModel.find({})
      .sort({ createDate: -1 })
      .limit(LIST_LIMIT);
    return documents.map((doc) => readTransform(doc.toJSON())) as unknown as ILogRow[];
  };
}

export default LogDbService;
