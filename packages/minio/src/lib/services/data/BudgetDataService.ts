import { IBudgetRow } from "../../../schema/Budget.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { BudgetData, BudgetRecordKey } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (key: BudgetRecordKey, name: string) => {
    return `${key.strategyName}/${key.exchangeName}/${key.frameName}/${key.backtest ? "backtest" : "live"}/${name}`;
}

export class BudgetDataService extends BaseStorage("backtest-kit/budget-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (key: BudgetRecordKey, name: string, payload: BudgetData, when: Date): Promise<void> => {
    this.loggerService.log("budgetDataService upsert", { key, name, when });
    const storageKey = GET_STORAGE_KEY_FN(key, name);
    const now = new Date();
    const row: IBudgetRow = {
      id: storageKey,
      strategyName: key.strategyName,
      exchangeName: key.exchangeName,
      frameName: key.frameName,
      backtest: key.backtest,
      name,
      payload,
      when: when.getTime(),
      createDate: now,
      updatedDate: now,
    };
    await this.set(storageKey, row);
  };

  public findByContext = async (key: BudgetRecordKey, name: string): Promise<IBudgetRow | null> => {
    this.loggerService.log("budgetDataService findByContext", { key, name });
    return await this.get<IBudgetRow>(GET_STORAGE_KEY_FN(key, name));
  };
}

export default BudgetDataService;
