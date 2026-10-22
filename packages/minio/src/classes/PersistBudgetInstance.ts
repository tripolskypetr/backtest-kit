import { BudgetData, IPersistBudgetInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

type BudgetRecordKey = {
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
};

export class PersistBudgetInstance implements IPersistBudgetInstance {
  constructor(
    readonly key: BudgetRecordKey,
    readonly name: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async readBudgetData(): Promise<BudgetData | null> {
    const row = await ioc.budgetDataService.findByContext(this.key, this.name);
    return row ? row.payload : null;
  }
  async writeBudgetData(data: BudgetData, when: Date): Promise<void> {
    await ioc.budgetDataService.upsert(this.key, this.name, data, when);
  }
  dispose(): void { void 0; }
}

export default PersistBudgetInstance;
