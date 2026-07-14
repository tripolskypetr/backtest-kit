import { MeasureData, IPersistMeasureInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistMeasureInstance implements IPersistMeasureInstance {
  constructor(readonly bucket: string) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readMeasureData(key: string): Promise<MeasureData | null> {
    const row = await ioc.measureDataService.findByKey(this.bucket, key);
    if (!row || row.removed) {
      return null;
    }
    return row.payload;
  }
  async writeMeasureData(data: MeasureData, key: string, _when: Date): Promise<void> {
    await ioc.measureDataService.upsert(this.bucket, key, data);
  }
  async removeMeasureData(key: string): Promise<void> {
    await ioc.measureDataService.softRemove(this.bucket, key);
  }
  async *listMeasureData(): AsyncGenerator<string> {
    const keys = await ioc.measureDataService.listKeys(this.bucket);
    for (const key of keys) {
      yield key;
    }
  }
}

export default PersistMeasureInstance;
