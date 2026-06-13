import BaseCRUD from "../../common/BaseCRUD";
import { IBreakevenRow, BreakevenModel } from "../../../schema/Breakeven.schema";
import { readTransform } from "../../../utils/readTransform";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import BreakevenCacheService from "../cache/BreakevenCacheService";
import { BreakevenData } from "backtest-kit";

export class BreakevenDbService extends BaseCRUD(BreakevenModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly breakevenCacheService = inject<BreakevenCacheService>(TYPES.breakevenCacheService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    signalId: string,
    payload: BreakevenData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("breakevenDbService upsert", { symbol, strategyName, exchangeName, signalId, when });
    const filter = { symbol, strategyName, exchangeName, signalId };
    const document = await BreakevenModel.findOneAndUpdate(
      filter,
      { $set: { payload, when: when.getTime() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as IBreakevenRow;
    await this.breakevenCacheService.setBreakevenId(result);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    signalId: string,
  ): Promise<IBreakevenRow | null> => {
    this.loggerService.log("breakevenDbService findByContext", { symbol, strategyName, exchangeName, signalId });
    const cachedId = await this.breakevenCacheService.getBreakevenId(symbol, strategyName, exchangeName, signalId);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as IBreakevenRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ symbol, strategyName, exchangeName, signalId }) as IBreakevenRow | null;
    if (result) {
      await this.breakevenCacheService.setBreakevenId(result);
    }
    return result;
  };
}

export default BreakevenDbService;
