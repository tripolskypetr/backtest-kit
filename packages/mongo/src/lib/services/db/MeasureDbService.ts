import BaseCRUD from "../../common/BaseCRUD";
import { IMeasureRow, MeasureModel } from "../../../schema/Measure.schema";
import { readTransform } from "../../../utils/readTransform";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import MeasureCacheService from "../cache/MeasureCacheService";
import { MeasureData } from "backtest-kit";

export class MeasureDbService extends BaseCRUD(MeasureModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly measureCacheService = inject<MeasureCacheService>(TYPES.measureCacheService);

  public upsert = async (bucket: string, entryKey: string, payload: MeasureData): Promise<void> => {
    this.loggerService.log("measureDbService upsert", { bucket, entryKey });
    const filter = { bucket, entryKey };
    const document = await MeasureModel.findOneAndUpdate(
      filter,
      { $set: { payload, removed: payload.removed } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as IMeasureRow;
    await this.measureCacheService.setMeasureId(result);
  };

  public findByKey = async (bucket: string, entryKey: string): Promise<IMeasureRow | null> => {
    this.loggerService.log("measureDbService findByKey", { bucket, entryKey });
    const cachedId = await this.measureCacheService.getMeasureId(bucket, entryKey);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as IMeasureRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ bucket, entryKey }) as IMeasureRow | null;
    if (result) {
      await this.measureCacheService.setMeasureId(result);
    }
    return result;
  };

  public softRemove = async (bucket: string, entryKey: string): Promise<void> => {
    this.loggerService.log("measureDbService softRemove", { bucket, entryKey });
    const filter = { bucket, entryKey };
    const document = await MeasureModel.findOneAndUpdate(
      filter,
      { $set: { removed: true, "payload.removed": true } },
      { new: true },
    );
    if (!document) {
      return;
    }
    const result = readTransform(document.toJSON()) as unknown as IMeasureRow;
    await this.measureCacheService.setMeasureId(result);
  };

  public listKeys = async (bucket: string): Promise<string[]> => {
    this.loggerService.log("measureDbService listKeys", { bucket });
    const rows = await super.findAll({ bucket, removed: false }) as IMeasureRow[];
    return rows.map((row) => row.entryKey);
  };
}

export default MeasureDbService;
