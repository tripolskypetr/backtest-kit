import { IStateRow } from "../../../schema/State.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { StateData } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (signalId: string, bucketName: string) => {
    return `${signalId}/${bucketName}`;
}

export class StateDataService extends BaseStorage("backtest-kit/state-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (signalId: string, bucketName: string, payload: StateData, when: Date): Promise<void> => {
    this.loggerService.log("stateDataService upsert", { signalId, bucketName, when });
    const key = GET_STORAGE_KEY_FN(signalId, bucketName);
    const now = new Date();
    const row: IStateRow = {
      id: key,
      signalId,
      bucketName,
      payload,
      when: when.getTime(),
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByContext = async (signalId: string, bucketName: string): Promise<IStateRow | null> => {
    this.loggerService.log("stateDataService findByContext", { signalId, bucketName });
    return await this.get<IStateRow>(GET_STORAGE_KEY_FN(signalId, bucketName));
  };
}

export default StateDataService;
