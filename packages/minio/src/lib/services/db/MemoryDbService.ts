import BaseCRUD from "../../common/BaseCRUD";
import { IMemoryRow, MemoryModel } from "../../../schema/Memory.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import MemoryCacheService from "../cache/MemoryCacheService";
import { MemoryData } from "backtest-kit";

export class MemoryDbService extends BaseCRUD(MemoryModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly memoryCacheService = inject<MemoryCacheService>(TYPES.memoryCacheService);

  public upsert = async (
    signalId: string,
    bucketName: string,
    memoryId: string,
    payload: MemoryData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("memoryDbService upsert", { signalId, bucketName, memoryId, when });
    const repo = await this.repo<IMemoryRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ signalId, bucketName, memoryId, payload, removed: Boolean(payload.removed), when: when.getTime() })
      .orUpdate(["payload", "removed", "when"], ["signalId", "bucketName", "memoryId"])
      .returning("*")
      .execute();
    const result = raw[0] as IMemoryRow;
    await this.memoryCacheService.setMemoryEntryId(result);
  };

  public findByMemoryId = async (
    signalId: string,
    bucketName: string,
    memoryId: string,
  ): Promise<IMemoryRow | null> => {
    this.loggerService.log("memoryDbService findByMemoryId", { signalId, bucketName, memoryId });
    const cachedId = await this.memoryCacheService.getMemoryEntryId(signalId, bucketName, memoryId);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IMemoryRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ signalId, bucketName, memoryId }) as IMemoryRow | null;
    if (result) {
      await this.memoryCacheService.setMemoryEntryId(result);
    }
    return result;
  };

  public hasMemoryEntry = async (
    signalId: string,
    bucketName: string,
    memoryId: string,
  ): Promise<boolean> => {
    this.loggerService.log("memoryDbService hasMemoryEntry", { signalId, bucketName, memoryId });
    if (await this.memoryCacheService.hasMemoryEntryId(signalId, bucketName, memoryId)) {
      return true;
    }
    const row = await super.findByFilter({ signalId, bucketName, memoryId }) as IMemoryRow | null;
    if (row) {
      await this.memoryCacheService.setMemoryEntryId(row);
      return true;
    }
    return false;
  };

  public softRemove = async (
    signalId: string,
    bucketName: string,
    memoryId: string,
  ): Promise<void> => {
    this.loggerService.log("memoryDbService softRemove", { signalId, bucketName, memoryId });
    const repo = await this.repo<IMemoryRow>();
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
      .where({ signalId, bucketName, memoryId })
      .returning("*")
      .execute();
    const saved = raw[0] as IMemoryRow | undefined;
    if (!saved) {
      return;
    }
    await this.memoryCacheService.setMemoryEntryId(saved);
  };

  public listEntries = async (signalId: string, bucketName: string): Promise<IMemoryRow[]> => {
    this.loggerService.log("memoryDbService listEntries", { signalId, bucketName });
    return await super.findAll({ signalId, bucketName, removed: false }) as IMemoryRow[];
  };
}

export default MemoryDbService;
