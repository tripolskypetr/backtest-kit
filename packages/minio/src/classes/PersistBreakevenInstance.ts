import { BreakevenData, IPersistBreakevenInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistBreakevenInstance implements IPersistBreakevenInstance {
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
  async readBreakevenData(signalId: string, _when: Date): Promise<BreakevenData> {
    const row = await ioc.breakevenDbService.findByContext(this.symbol, this.strategyName, this.exchangeName, signalId);
    return row ? row.payload : {};
  }
  async writeBreakevenData(data: BreakevenData, signalId: string, when: Date): Promise<void> {
    await ioc.breakevenDbService.upsert(this.symbol, this.strategyName, this.exchangeName, signalId, data, when);
  }
}

export default PersistBreakevenInstance;
