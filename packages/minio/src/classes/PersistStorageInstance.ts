import { StorageData, IPersistStorageInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistStorageInstance implements IPersistStorageInstance {
  constructor(readonly backtest: boolean) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readStorageData(): Promise<StorageData> {
    const rows = await ioc.storageDataService.listByMode(this.backtest);
    return rows.map((row) => row.payload);
  }
  async writeStorageData(signals: StorageData): Promise<void> {
    for (const signal of signals) {
      await ioc.storageDataService.upsert(this.backtest, signal.id, signal);
    }
  }
}

export default PersistStorageInstance;
