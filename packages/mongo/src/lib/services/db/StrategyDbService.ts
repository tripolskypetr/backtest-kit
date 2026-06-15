import BaseCRUD from "../../common/BaseCRUD";
import { IStrategyRow, StrategyModel } from "../../../schema/Strategy.schema";
import { readTransform } from "../../../utils/readTransform";
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
    const filter = { symbol, strategyName, exchangeName };
    const document = await StrategyModel.findOneAndUpdate(
      filter,
      { $set: { payload } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as IStrategyRow;
    await this.strategyCacheService.setStrategyId(result);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
  ): Promise<IStrategyRow | null> => {
    this.loggerService.log("strategyDbService findByContext", { symbol, strategyName, exchangeName });
    const cachedId = await this.strategyCacheService.getStrategyId(symbol, strategyName, exchangeName);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as IStrategyRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ symbol, strategyName, exchangeName }) as IStrategyRow | null;
    if (result) {
      await this.strategyCacheService.setStrategyId(result);
    }
    return result;
  };
}

export default StrategyDbService;
