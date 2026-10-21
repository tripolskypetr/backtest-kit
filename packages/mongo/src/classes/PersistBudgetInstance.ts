import { BudgetData, BudgetRecordKey, IPersistBudgetInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

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
    const row = await ioc.budgetDbService.findByContext(this.key, this.name);
    return row ? row.payload : null;
  }
  async writeBudgetData(data: BudgetData, when: Date): Promise<void> {
    await ioc.budgetDbService.upsert(this.key, this.name, data, when);
  }
  dispose(): void { void 0; }
}

export default PersistBudgetInstance;
