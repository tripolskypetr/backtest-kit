import { IDictionaryRow } from "../../../schema/Dictionary.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { DictionaryData } from "tradeforge";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (signalId: string, dictionaryName: string) => {
    return `${signalId}/${dictionaryName}`;
}

export class DictionaryDataService extends BaseStorage("backtest-kit/dictionary-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (signalId: string, dictionaryName: string, payload: DictionaryData, when: Date): Promise<void> => {
    this.loggerService.log("dictionaryDataService upsert", { signalId, dictionaryName, when });
    const key = GET_STORAGE_KEY_FN(signalId, dictionaryName);
    const now = new Date();
    const row: IDictionaryRow = {
      id: key,
      signalId,
      dictionaryName,
      payload,
      when: when.getTime(),
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByContext = async (signalId: string, dictionaryName: string): Promise<IDictionaryRow | null> => {
    this.loggerService.log("dictionaryDataService findByContext", { signalId, dictionaryName });
    return await this.get<IDictionaryRow>(GET_STORAGE_KEY_FN(signalId, dictionaryName));
  };
}

export default DictionaryDataService;
