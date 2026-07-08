import BaseCRUD from "../../common/BaseCRUD";
import { IStorageRow, StorageModel } from "../../../schema/Storage.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import StorageCacheService from "../cache/StorageCacheService";
import { IStorageSignalRow } from "backtest-kit";

export class StorageDbService extends BaseCRUD(StorageModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly storageCacheService = inject<StorageCacheService>(TYPES.storageCacheService);

  public upsert = async (
    backtest: boolean,
    signalId: string,
    payload: IStorageSignalRow,
  ): Promise<void> => {
    this.loggerService.log("storageDbService upsert", { backtest, signalId });
    const repo = await this.repo<IStorageRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ backtest, signalId, payload })
      .orUpdate(["payload"], ["backtest", "signalId"])
      .returning("*")
      .execute();
    const result = raw[0] as IStorageRow;
    await this.storageCacheService.setStorageId(result);
  };

  public findBySignalId = async (
    backtest: boolean,
    signalId: string,
  ): Promise<IStorageRow | null> => {
    this.loggerService.log("storageDbService findBySignalId", { backtest, signalId });
    const cachedId = await this.storageCacheService.getStorageId(backtest, signalId);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IStorageRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ backtest, signalId }) as IStorageRow | null;
    if (result) {
      await this.storageCacheService.setStorageId(result);
    }
    return result;
  };

  public listByMode = async (backtest: boolean): Promise<IStorageRow[]> => {
    this.loggerService.log("storageDbService listByMode", { backtest });
    return await super.findAll({ backtest }) as IStorageRow[];
  };
}

export default StorageDbService;
