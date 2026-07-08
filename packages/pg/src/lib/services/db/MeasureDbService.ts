import BaseCRUD from "../../common/BaseCRUD";
import { IMeasureRow, MeasureModel } from "../../../schema/Measure.schema";
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
    const repo = await this.repo<IMeasureRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ bucket, entryKey, payload, removed: Boolean(payload.removed) })
      .orUpdate(["payload", "removed"], ["bucket", "entryKey"])
      .returning("*")
      .execute();
    const result = raw[0] as IMeasureRow;
    await this.measureCacheService.setMeasureId(result);
  };

  public findByKey = async (bucket: string, entryKey: string): Promise<IMeasureRow | null> => {
    this.loggerService.log("measureDbService findByKey", { bucket, entryKey });
    const cachedId = await this.measureCacheService.getMeasureId(bucket, entryKey);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IMeasureRow | null;
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
    const repo = await this.repo<IMeasureRow>();
    // Atomic soft-remove: a single UPDATE computes the new value server-side.
    // No read-modify-write, so there is no stale read from a replica and no
    // lost update under concurrent upserts. The nested payload.removed flag is
    // set in-place via jsonb_set. Early-return when the row does not exist.
    const { raw } = await repo
      .createQueryBuilder()
      .update()
      .set({
        removed: true,
        payload: () => `jsonb_set("payload", '{removed}', 'true')`,
      })
      .where({ bucket, entryKey })
      .returning("*")
      .execute();
    const saved = raw[0] as IMeasureRow | undefined;
    if (!saved) {
      return;
    }
    await this.measureCacheService.setMeasureId(saved);
  };

  public listKeys = async (bucket: string): Promise<string[]> => {
    this.loggerService.log("measureDbService listKeys", { bucket });
    const rows = await super.findAll({ bucket, removed: false }) as IMeasureRow[];
    return rows.map((row) => row.entryKey);
  };
}

export default MeasureDbService;
