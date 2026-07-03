import { SessionData, IPersistSessionInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistSessionInstance implements IPersistSessionInstance {
  constructor(
    readonly strategyName: string,
    readonly exchangeName: string,
    readonly frameName: string,
    readonly symbol: string,
    readonly backtest: boolean,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readSessionData(): Promise<SessionData | null> {
    const row = await ioc.sessionDbService.findByContext(this.strategyName, this.exchangeName, this.frameName, this.symbol, this.backtest);
    return row ? row.payload : null;
  }
  async writeSessionData(data: SessionData, when: Date): Promise<void> {
    await ioc.sessionDbService.upsert(this.strategyName, this.exchangeName, this.frameName, this.symbol, this.backtest, data, when);
  }
  dispose(): void { void 0; }
}

export default PersistSessionInstance;
