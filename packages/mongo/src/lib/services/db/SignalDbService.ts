import BaseCRUD from "../../common/BaseCRUD";
import { ISignalRowDoc, SignalModel } from "../../../schema/Signal.schema";
import { readTransform } from "../../../utils/readTransform";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import SignalCacheService from "../cache/SignalCacheService";
import { ISignalRow } from "backtest-kit";

export class SignalDbService extends BaseCRUD(SignalModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly signalCacheService = inject<SignalCacheService>(TYPES.signalCacheService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    payload: ISignalRow | null,
  ): Promise<void> => {
    this.loggerService.log("signalDbService upsert", { symbol, strategyName, exchangeName });
    const filter = { symbol, strategyName, exchangeName };
    const document = await SignalModel.findOneAndUpdate(
      filter,
      { $set: { payload } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as ISignalRowDoc;
    await this.signalCacheService.setSignalId(result);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
  ): Promise<ISignalRowDoc | null> => {
    this.loggerService.log("signalDbService findByContext", { symbol, strategyName, exchangeName });
    const cachedId = await this.signalCacheService.getSignalId(symbol, strategyName, exchangeName);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as ISignalRowDoc | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ symbol, strategyName, exchangeName }) as ISignalRowDoc | null;
    if (result) {
      await this.signalCacheService.setSignalId(result);
    }
    return result;
  };
}

export default SignalDbService;
