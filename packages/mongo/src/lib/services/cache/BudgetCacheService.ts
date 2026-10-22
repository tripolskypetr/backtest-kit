import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IBudgetRow } from "../../../schema/Budget.schema";
import { BudgetRecordKey } from "backtest-kit";

const REDIS_KEY = "budget_cache";

export class BudgetCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(key: BudgetRecordKey, name: string): string {
    return `${key.strategyName}:${key.exchangeName}:${key.frameName}:${key.backtest ? "backtest" : "live"}:${name}`;
  }

  public async hasBudgetId(key: BudgetRecordKey, name: string): Promise<boolean> {
    this.loggerService.log("budgetCacheService hasBudgetId", { key, name });
    return await this.has(this._cacheKey(key, name));
  }

  public async getBudgetId(key: BudgetRecordKey, name: string): Promise<string | null> {
    this.loggerService.log("budgetCacheService getBudgetId", { key, name });
    const id = <string>await super.get(this._cacheKey(key, name));
    return id ?? null;
  }

  public async setBudgetId(row: IBudgetRow): Promise<string> {
    this.loggerService.log("budgetCacheService setBudgetId", {
      strategyName: row.strategyName,
      exchangeName: row.exchangeName,
      frameName: row.frameName,
      backtest: row.backtest,
      name: row.name,
    });
    await super.set(this._cacheKey(row, row.name), row.id);
    return row.id;
  }
}

export default BudgetCacheService;
