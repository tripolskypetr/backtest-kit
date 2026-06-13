import BaseCRUD from "../../common/BaseCRUD";
import { IStateRow, StateModel } from "../../../schema/State.schema";
import { readTransform } from "../../../utils/readTransform";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import StateCacheService from "../cache/StateCacheService";
import { StateData } from "backtest-kit";

export class StateDbService extends BaseCRUD(StateModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly stateCacheService = inject<StateCacheService>(TYPES.stateCacheService);

  public upsert = async (signalId: string, bucketName: string, payload: StateData, when: Date): Promise<void> => {
    this.loggerService.log("stateDbService upsert", { signalId, bucketName, when });
    const filter = { signalId, bucketName };
    const document = await StateModel.findOneAndUpdate(
      filter,
      { $set: { payload, when: when.getTime() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as IStateRow;
    await this.stateCacheService.setStateId(result);
  };

  public findByContext = async (signalId: string, bucketName: string): Promise<IStateRow | null> => {
    this.loggerService.log("stateDbService findByContext", { signalId, bucketName });
    const cachedId = await this.stateCacheService.getStateId(signalId, bucketName);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as IStateRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ signalId, bucketName }) as IStateRow | null;
    if (result) {
      await this.stateCacheService.setStateId(result);
    }
    return result;
  };
}

export default StateDbService;
