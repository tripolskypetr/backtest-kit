import BaseCRUD from "../../common/BaseCRUD";
import { IBudgetRow, BudgetModel } from "../../../schema/Budget.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import BudgetCacheService from "../cache/BudgetCacheService";
import { BudgetData, BudgetRecordKey } from "backtest-kit";

export class BudgetDbService extends BaseCRUD(BudgetModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly budgetCacheService = inject<BudgetCacheService>(TYPES.budgetCacheService);

  public upsert = async (key: BudgetRecordKey, name: string, payload: BudgetData, when: Date): Promise<void> => {
    this.loggerService.log("budgetDbService upsert", { key, name, when });
    const repo = await this.repo<IBudgetRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({
        strategyName: key.strategyName,
        exchangeName: key.exchangeName,
        frameName: key.frameName,
        backtest: key.backtest,
        name,
        payload,
        when: when.getTime(),
      })
      .orUpdate(["payload", "when"], ["strategyName", "exchangeName", "frameName", "backtest", "name"])
      .returning("*")
      .execute();
    const result = raw[0] as IBudgetRow;
    await this.budgetCacheService.setBudgetId(result);
  };

  public findByContext = async (key: BudgetRecordKey, name: string): Promise<IBudgetRow | null> => {
    this.loggerService.log("budgetDbService findByContext", { key, name });
    const cachedId = await this.budgetCacheService.getBudgetId(key, name);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IBudgetRow | null;
      if (cached) {
        return cached;
      }
    }
    const filter = {
      strategyName: key.strategyName,
      exchangeName: key.exchangeName,
      frameName: key.frameName,
      backtest: key.backtest,
      name,
    };
    const result = await super.findByFilter(filter) as IBudgetRow | null;
    if (result) {
      await this.budgetCacheService.setBudgetId(result);
    }
    return result;
  };
}

export default BudgetDbService;
