import { IntervalData, IPersistIntervalInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistIntervalInstance implements IPersistIntervalInstance {
  constructor(readonly bucket: string) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readIntervalData(key: string): Promise<IntervalData | null> {
    const row = await ioc.intervalDbService.findByKey(this.bucket, key);
    if (!row || row.removed) {
      return null;
    }
    return row.payload;
  }
  async writeIntervalData(data: IntervalData, key: string, when: Date): Promise<void> {
    await ioc.intervalDbService.upsert(this.bucket, key, data, when);
  }
  async removeIntervalData(key: string): Promise<void> {
    await ioc.intervalDbService.softRemove(this.bucket, key);
  }
  async *listIntervalData(): AsyncGenerator<string> {
    const keys = await ioc.intervalDbService.listKeys(this.bucket);
    for (const key of keys) {
      yield key;
    }
  }
}

export default PersistIntervalInstance;
