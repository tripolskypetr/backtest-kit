import { IMemoryRow } from "../../../schema/Memory.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { MemoryData } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (signalId: string, bucketName: string, memoryId: string) => {
    return `${signalId}/${bucketName}/${memoryId}`;
}

export class MemoryDataService extends BaseStorage("backtest-kit/memory-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (
    signalId: string,
    bucketName: string,
    memoryId: string,
    payload: MemoryData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("memoryDataService upsert", { signalId, bucketName, memoryId, when });
    const key = GET_STORAGE_KEY_FN(signalId, bucketName, memoryId);
    // removed==true means logically absent: deleting the object keeps
    // listEntries free of tombstone bodies
    if (payload.removed) {
      await this.delete(key);
      return;
    }
    const now = new Date();
    const row: IMemoryRow = {
      id: key,
      signalId,
      bucketName,
      memoryId,
      payload,
      removed: false,
      when: when.getTime(),
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByMemoryId = async (
    signalId: string,
    bucketName: string,
    memoryId: string,
  ): Promise<IMemoryRow | null> => {
    this.loggerService.log("memoryDataService findByMemoryId", { signalId, bucketName, memoryId });
    return await this.get<IMemoryRow>(GET_STORAGE_KEY_FN(signalId, bucketName, memoryId));
  };

  public hasMemoryEntry = async (
    signalId: string,
    bucketName: string,
    memoryId: string,
  ): Promise<boolean> => {
    this.loggerService.log("memoryDataService hasMemoryEntry", { signalId, bucketName, memoryId });
    return await this.has(GET_STORAGE_KEY_FN(signalId, bucketName, memoryId));
  };

  public softRemove = async (
    signalId: string,
    bucketName: string,
    memoryId: string,
  ): Promise<void> => {
    this.loggerService.log("memoryDataService softRemove", { signalId, bucketName, memoryId });
    await this.delete(GET_STORAGE_KEY_FN(signalId, bucketName, memoryId));
  };

  public listEntries = async (signalId: string, bucketName: string): Promise<IMemoryRow[]> => {
    this.loggerService.log("memoryDataService listEntries", { signalId, bucketName });
    const rows: IMemoryRow[] = [];
    // Bodies are genuinely needed here (BM25 index rebuild); removed entries
    // do not exist as objects, so every GET is a real entry
    for await (const value of this.values(`${signalId}/${bucketName}/`)) {
      rows.push(value as IMemoryRow);
    }
    return rows;
  };
}

export default MemoryDataService;
