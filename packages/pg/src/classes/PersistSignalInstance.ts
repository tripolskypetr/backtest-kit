import { ISignalRow, IPersistSignalInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistSignalInstance implements IPersistSignalInstance {
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
  async readSignalData(): Promise<ISignalRow | null> {
    const row = await ioc.signalDbService.findByContext(this.symbol, this.strategyName, this.exchangeName);
    return row ? row.payload : null;
  }
  async writeSignalData(signalRow: ISignalRow | null): Promise<void> {
    await ioc.signalDbService.upsert(this.symbol, this.strategyName, this.exchangeName, signalRow);
  }
}

export default PersistSignalInstance;
