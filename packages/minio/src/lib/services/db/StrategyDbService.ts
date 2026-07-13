import BaseCRUD from "../../common/BaseCRUD";
import { IStrategyRow, StrategyModel } from "../../../schema/Strategy.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import StrategyCacheService from "../cache/StrategyCacheService";
import { StrategyData } from "backtest-kit";

export class StrategyDbService extends BaseCRUD(StrategyModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly strategyCacheService = inject<StrategyCacheService>(TYPES.strategyCacheService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    payload: StrategyData | null,
  ): Promise<void> => {
    this.loggerService.log("strategyDbService upsert", { symbol, strategyName, exchangeName });
    const repo = await this.repo<IStrategyRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ symbol, strategyName, exchangeName, payload })
      .orUpdate(["payload"], ["symbol", "strategyName", "exchangeName"])
      .returning("*")
      .execute();
    const result = raw[0] as IStrategyRow;
    await this.strategyCacheService.setStrategyId(result);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
  ): Promise<IStrategyRow | null> => {
    this.loggerService.log("strategyDbService findByContext", { symbol, strategyName, exchangeName });
    try {
      const cachedId = await this.strategyCacheService.getStrategyId(symbol, strategyName, exchangeName);
      if (cachedId) {
        return await super.findById(cachedId) as IStrategyRow;
      }
    } catch {
      void 0;
    }
    const result = await super.findByFilter({ symbol, strategyName, exchangeName }) as IStrategyRow | null;
    if (result) {
      await this.strategyCacheService.setStrategyId(result);
    }
    return result;
  };
}

export default StrategyDbService;
