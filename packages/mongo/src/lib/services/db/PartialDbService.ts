import BaseCRUD from "../../common/BaseCRUD";
import { IPartialRow, PartialModel } from "../../../schema/Partial.schema";
import { readTransform } from "../../../utils/readTransform";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import PartialCacheService from "../cache/PartialCacheService";
import { PartialData } from "backtest-kit";

export class PartialDbService extends BaseCRUD(PartialModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly partialCacheService = inject<PartialCacheService>(TYPES.partialCacheService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    signalId: string,
    payload: PartialData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("partialDbService upsert", { symbol, strategyName, exchangeName, signalId, when });
    const filter = { symbol, strategyName, exchangeName, signalId };
    const document = await PartialModel.findOneAndUpdate(
      filter,
      { $set: { payload, when: when.getTime() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as IPartialRow;
    await this.partialCacheService.setPartialId(result);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    signalId: string,
  ): Promise<IPartialRow | null> => {
    this.loggerService.log("partialDbService findByContext", { symbol, strategyName, exchangeName, signalId });
    const cachedId = await this.partialCacheService.getPartialId(symbol, strategyName, exchangeName, signalId);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as IPartialRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ symbol, strategyName, exchangeName, signalId }) as IPartialRow | null;
    if (result) {
      await this.partialCacheService.setPartialId(result);
    }
    return result;
  };
}

export default PartialDbService;
