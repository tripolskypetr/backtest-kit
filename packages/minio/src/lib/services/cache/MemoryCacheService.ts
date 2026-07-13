import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IMemoryRow } from "../../../schema/Memory.schema";

const REDIS_KEY = "memory_cache";

export class MemoryCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(signalId: string, bucketName: string, memoryId: string): string {
    return `${signalId}:${bucketName}:${memoryId}`;
  }

  public async hasMemoryEntryId(signalId: string, bucketName: string, memoryId: string): Promise<boolean> {
    this.loggerService.log("memoryCacheService hasMemoryEntryId", { signalId, bucketName, memoryId });
    return await this.has(this._cacheKey(signalId, bucketName, memoryId));
  }

  public async getMemoryEntryId(signalId: string, bucketName: string, memoryId: string): Promise<string | null> {
    this.loggerService.log("memoryCacheService getMemoryEntryId", { signalId, bucketName, memoryId });
    const id = <string>await super.get(this._cacheKey(signalId, bucketName, memoryId));
    return id ?? null;
  }

  public async setMemoryEntryId(row: IMemoryRow): Promise<string> {
    this.loggerService.log("memoryCacheService setMemoryEntryId", {
      signalId: row.signalId,
      bucketName: row.bucketName,
      memoryId: row.memoryId,
    });
    await super.set(this._cacheKey(row.signalId, row.bucketName, row.memoryId), row.id);
    return row.id;
  }
}

export default MemoryCacheService;
