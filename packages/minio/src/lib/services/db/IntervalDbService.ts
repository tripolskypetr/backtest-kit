import BaseCRUD from "../../common/BaseCRUD";
import { IIntervalRow, IntervalModel } from "../../../schema/Interval.schema";
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
    const repo = await this.repo<IIntervalRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ bucket, entryKey, payload, removed: Boolean(payload.removed), when: when.getTime() })
      .orUpdate(["payload", "removed", "when"], ["bucket", "entryKey"])
      .returning("*")
      .execute();
    const result = raw[0] as IIntervalRow;
    await this.intervalCacheService.setIntervalId(result);
  };

  public findByKey = async (bucket: string, entryKey: string): Promise<IIntervalRow | null> => {
    this.loggerService.log("intervalDbService findByKey", { bucket, entryKey });
    const cachedId = await this.intervalCacheService.getIntervalId(bucket, entryKey);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IIntervalRow | null;
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
    const repo = await this.repo<IIntervalRow>();
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
    const saved = raw[0] as IIntervalRow | undefined;
    if (!saved) {
      return;
    }
    await this.intervalCacheService.setIntervalId(saved);
  };

  public listKeys = async (bucket: string): Promise<string[]> => {
    this.loggerService.log("intervalDbService listKeys", { bucket });
    const rows = await super.findAll({ bucket, removed: false }) as IIntervalRow[];
    return rows.map((row) => row.entryKey);
  };

  public clearBucket = async (bucket: string): Promise<void> => {
    this.loggerService.log("intervalDbService clearBucket", { bucket });
    const repo = await this.repo<IIntervalRow>();
    const rows = await super.findAll({ bucket }) as IIntervalRow[];
    for (const row of rows) {
      await this.intervalCacheService.deleteIntervalId(bucket, row.entryKey);
    }
    await repo.delete({ bucket });
  };
}

export default IntervalDbService;
