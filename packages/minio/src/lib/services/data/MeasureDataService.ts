import { IMeasureRow } from "../../../schema/Measure.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { MeasureData } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (bucket: string, entryKey: string) => {
    return `${bucket}/${entryKey}`;
}

export class MeasureDataService extends BaseStorage("backtest-kit/measure-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (bucket: string, entryKey: string, payload: MeasureData): Promise<void> => {
    this.loggerService.log("measureDataService upsert", { bucket, entryKey });
    const key = GET_STORAGE_KEY_FN(bucket, entryKey);
    // removed==true means logically absent: deleting the object keeps
    // listKeys a pure LIST without reading bodies
    if (payload.removed) {
      await this.delete(key);
      return;
    }
    const now = new Date();
    const row: IMeasureRow = {
      id: key,
      bucket,
      entryKey,
      payload,
      removed: false,
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByKey = async (bucket: string, entryKey: string): Promise<IMeasureRow | null> => {
    this.loggerService.log("measureDataService findByKey", { bucket, entryKey });
    return await this.get<IMeasureRow>(GET_STORAGE_KEY_FN(bucket, entryKey));
  };

  public softRemove = async (bucket: string, entryKey: string): Promise<void> => {
    this.loggerService.log("measureDataService softRemove", { bucket, entryKey });
    await this.delete(GET_STORAGE_KEY_FN(bucket, entryKey));
  };

  public listKeys = async (bucket: string): Promise<string[]> => {
    this.loggerService.log("measureDataService listKeys", { bucket });
    const prefix = `${bucket}/`;
    const entryKeys: string[] = [];
    for await (const key of this.keys(prefix)) {
      entryKeys.push(key.slice(prefix.length));
    }
    return entryKeys;
  };
}

export default MeasureDataService;
