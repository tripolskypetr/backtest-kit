import { MemoryData, IPersistMemoryInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistMemoryInstance implements IPersistMemoryInstance {
  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readMemoryData(memoryId: string): Promise<MemoryData | null> {
    const row = await ioc.memoryDbService.findByMemoryId(this.signalId, this.bucketName, memoryId);
    if (!row || row.removed) {
      return null;
    }
    return row.payload;
  }
  async hasMemoryData(memoryId: string): Promise<boolean> {
    return await ioc.memoryDbService.hasMemoryEntry(this.signalId, this.bucketName, memoryId);
  }
  async writeMemoryData(data: MemoryData, memoryId: string, when: Date): Promise<void> {
    await ioc.memoryDbService.upsert(this.signalId, this.bucketName, memoryId, data, when);
  }
  async removeMemoryData(memoryId: string): Promise<void> {
    await ioc.memoryDbService.softRemove(this.signalId, this.bucketName, memoryId);
  }
  async *listMemoryData(): AsyncGenerator<{ memoryId: string; data: MemoryData }> {
    const rows = await ioc.memoryDbService.listEntries(this.signalId, this.bucketName);
    for (const row of rows) {
      yield { memoryId: row.memoryId, data: row.payload };
    }
  }
  dispose(): void { void 0; }
}

export default PersistMemoryInstance;
