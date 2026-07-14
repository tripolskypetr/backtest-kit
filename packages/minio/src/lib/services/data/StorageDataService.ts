import { IStorageRow } from "../../../schema/Storage.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import StorageConnectionService from "../connection/StorageConnectionService";
import { IStorageSignalRow } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

/**
 * Cap of the in-process index of already registered keys. Signals mutate and
 * are rewritten on every event, but each object name needs registering in the
 * Redis index only once — listNewest deduplicates cross-restart repeats.
 */
const REGISTERED_KEYS_LIMIT = 10_000;

const GET_STORAGE_KEY_FN = (backtest: boolean, signalId: string) => {
    return `${backtest}/${signalId}`;
}

export class StorageDataService extends BaseStorage("backtest-kit/storage-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly storageConnectionService = inject<StorageConnectionService>(TYPES.storageConnectionService);

  private _registeredKeys = new Set<string>();

  private _rememberKey(key: string): void {
    if (this._registeredKeys.size >= REGISTERED_KEYS_LIMIT) {
      const oldest = this._registeredKeys.values().next().value!;
      this._registeredKeys.delete(oldest);
    }
    this._registeredKeys.add(key);
  }

  public upsert = async (
    backtest: boolean,
    signalId: string,
    payload: IStorageSignalRow,
  ): Promise<void> => {
    this.loggerService.log("storageDataService upsert", { backtest, signalId });
    const key = GET_STORAGE_KEY_FN(backtest, signalId);
    const now = new Date();
    const row: IStorageRow = {
      id: key,
      backtest,
      signalId,
      payload,
      createDate: now,
      updatedDate: now,
    };
    // Signals mutate: the object is always rewritten under its stable key
    await this.set(key, row);
    if (!this._registeredKeys.has(key)) {
      await this.storageConnectionService.register(key);
      this._rememberKey(key);
    }
  };

  public findBySignalId = async (
    backtest: boolean,
    signalId: string,
  ): Promise<IStorageRow | null> => {
    this.loggerService.log("storageDataService findBySignalId", { backtest, signalId });
    return await this.get<IStorageRow>(GET_STORAGE_KEY_FN(backtest, signalId));
  };

  public listByMode = async (backtest: boolean): Promise<IStorageRow[]> => {
    this.loggerService.log("storageDataService listByMode", { backtest });
    const rows: IStorageRow[] = [];
    const names = await this.storageConnectionService.listNewest(Number.POSITIVE_INFINITY, `${backtest}/`);
    if (names.length) {
      for (const name of names) {
        const row = await this.get<IStorageRow>(name);
        if (row) {
          rows.push(row);
        }
      }
    } else {
      // Cold index (flushed Redis): fall back to the bucket listing and warm
      // the index back up
      for await (const value of this.values(`${backtest}/`)) {
        const row = value as IStorageRow;
        rows.push(row);
        await this.storageConnectionService.register(row.id);
      }
    }
    return rows;
  };
}

export default StorageDataService;
