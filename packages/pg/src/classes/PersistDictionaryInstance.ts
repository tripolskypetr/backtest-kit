import { DictionaryData, IPersistDictionaryInstance } from "tradeforge";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistDictionaryInstance implements IPersistDictionaryInstance {
  constructor(
    readonly signalId: string,
    readonly dictionaryName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readDictionaryData(): Promise<DictionaryData | null> {
    const row = await ioc.dictionaryDbService.findByContext(this.signalId, this.dictionaryName);
    return row ? row.payload : null;
  }
  async writeDictionaryData(data: DictionaryData, when: Date): Promise<void> {
    await ioc.dictionaryDbService.upsert(this.signalId, this.dictionaryName, data, when);
  }
  dispose(): void { void 0; }
}

export default PersistDictionaryInstance;
