import { StrategyData, IPersistStrategyInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistStrategyInstance implements IPersistStrategyInstance {
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
  async readStrategyData(): Promise<StrategyData | null> {
    const row = await ioc.strategyDataService.findByContext(this.symbol, this.strategyName, this.exchangeName);
    return row ? row.payload : null;
  }
  async writeStrategyData(strategyRow: StrategyData | null): Promise<void> {
    await ioc.strategyDataService.upsert(this.symbol, this.strategyName, this.exchangeName, strategyRow);
  }
}

export default PersistStrategyInstance;
