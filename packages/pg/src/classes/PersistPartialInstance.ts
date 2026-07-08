import { PartialData, IPersistPartialInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistPartialInstance implements IPersistPartialInstance {
  constructor(
    readonly symbol: string,
    readonly strategyName: string,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readPartialData(signalId: string, _when: Date): Promise<PartialData> {
    const row = await ioc.partialDbService.findByContext(this.symbol, this.strategyName, this.exchangeName, signalId);
    return row ? row.payload : {};
  }
  async writePartialData(data: PartialData, signalId: string, when: Date): Promise<void> {
    await ioc.partialDbService.upsert(this.symbol, this.strategyName, this.exchangeName, signalId, data, when);
  }
}

export default PersistPartialInstance;
