import { IIntervalRow } from "../../../schema/Interval.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { IntervalData } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (bucket: string, entryKey: string) => {
    return `${bucket}/${entryKey}`;
}

export class IntervalDataService extends BaseStorage("backtest-kit/interval-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (bucket: string, entryKey: string, payload: IntervalData, when: Date): Promise<void> => {
    this.loggerService.log("intervalDataService upsert", { bucket, entryKey, when });
    const key = GET_STORAGE_KEY_FN(bucket, entryKey);
    // removed==true means logically absent: deleting the object keeps
    // listKeys a pure LIST without reading bodies
    if (payload.removed) {
      await this.delete(key);
      return;
    }
    const now = new Date();
    const row: IIntervalRow = {
      id: key,
      bucket,
      entryKey,
      payload,
      removed: false,
      when: when.getTime(),
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByKey = async (bucket: string, entryKey: string): Promise<IIntervalRow | null> => {
    this.loggerService.log("intervalDataService findByKey", { bucket, entryKey });
    return await this.get<IIntervalRow>(GET_STORAGE_KEY_FN(bucket, entryKey));
  };

  public softRemove = async (bucket: string, entryKey: string): Promise<void> => {
    this.loggerService.log("intervalDataService softRemove", { bucket, entryKey });
    await this.delete(GET_STORAGE_KEY_FN(bucket, entryKey));
  };

  public listKeys = async (bucket: string): Promise<string[]> => {
    this.loggerService.log("intervalDataService listKeys", { bucket });
    const prefix = `${bucket}/`;
    const entryKeys: string[] = [];
    for await (const key of this.keys(prefix)) {
      entryKeys.push(key.slice(prefix.length));
    }
    return entryKeys;
  };

  public clearBucket = async (bucket: string): Promise<void> => {
    this.loggerService.log("intervalDataService clearBucket", { bucket });
    await this.clear(`${bucket}/`);
  };
}

export default IntervalDataService;
