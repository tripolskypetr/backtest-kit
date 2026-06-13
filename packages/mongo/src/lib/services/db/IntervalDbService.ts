import BaseCRUD from "../../common/BaseCRUD";
import { IIntervalRow, IntervalModel } from "../../../schema/Interval.schema";
import { readTransform } from "../../../utils/readTransform";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import IntervalCacheService from "../cache/IntervalCacheService";
import { IntervalData } from "backtest-kit";

export class IntervalDbService extends BaseCRUD(IntervalModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly intervalCacheService = inject<IntervalCacheService>(TYPES.intervalCacheService);

  public upsert = async (bucket: string, entryKey: string, payload: IntervalData, when: Date): Promise<void> => {
    this.loggerService.log("intervalDbService upsert", { bucket, entryKey, when });
    const filter = { bucket, entryKey };
    const document = await IntervalModel.findOneAndUpdate(
      filter,
      { $set: { payload, removed: payload.removed, when: when.getTime() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as IIntervalRow;
    await this.intervalCacheService.setIntervalId(result);
  };

  public findByKey = async (bucket: string, entryKey: string): Promise<IIntervalRow | null> => {
    this.loggerService.log("intervalDbService findByKey", { bucket, entryKey });
    const cachedId = await this.intervalCacheService.getIntervalId(bucket, entryKey);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as IIntervalRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ bucket, entryKey }) as IIntervalRow | null;
    if (result) {
      await this.intervalCacheService.setIntervalId(result);
    }
    return result;
  };

  public softRemove = async (bucket: string, entryKey: string): Promise<void> => {
    this.loggerService.log("intervalDbService softRemove", { bucket, entryKey });
    const filter = { bucket, entryKey };
    const document = await IntervalModel.findOneAndUpdate(
      filter,
      { $set: { removed: true, "payload.removed": true } },
      { new: true },
    );
    if (!document) {
      return;
    }
    const result = readTransform(document.toJSON()) as unknown as IIntervalRow;
    await this.intervalCacheService.setIntervalId(result);
  };

  public listKeys = async (bucket: string): Promise<string[]> => {
    this.loggerService.log("intervalDbService listKeys", { bucket });
    const rows = await super.findAll({ bucket, removed: false }) as IIntervalRow[];
    return rows.map((row) => row.entryKey);
  };

  public clearBucket = async (bucket: string): Promise<void> => {
    this.loggerService.log("intervalDbService clearBucket", { bucket });
    const rows = await super.findAll({ bucket }) as IIntervalRow[];
    for (const row of rows) {
      await this.intervalCacheService.deleteIntervalId(bucket, row.entryKey);
    }
    await IntervalModel.deleteMany({ bucket });
  };
}

export default IntervalDbService;
