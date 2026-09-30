import BaseCRUD from "../../common/BaseCRUD";
import { IDictionaryRow, DictionaryModel } from "../../../schema/Dictionary.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import DictionaryCacheService from "../cache/DictionaryCacheService";
import { DictionaryData } from "tradeforge";

export class DictionaryDbService extends BaseCRUD(DictionaryModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly dictionaryCacheService = inject<DictionaryCacheService>(TYPES.dictionaryCacheService);

  public upsert = async (signalId: string, dictionaryName: string, payload: DictionaryData, when: Date): Promise<void> => {
    this.loggerService.log("dictionaryDbService upsert", { signalId, dictionaryName, when });
    const repo = await this.repo<IDictionaryRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ signalId, dictionaryName, payload, when: when.getTime() })
      .orUpdate(["payload", "when"], ["signalId", "dictionaryName"])
      .returning("*")
      .execute();
    const result = raw[0] as IDictionaryRow;
    await this.dictionaryCacheService.setDictionaryId(result);
  };

  public findByContext = async (signalId: string, dictionaryName: string): Promise<IDictionaryRow | null> => {
    this.loggerService.log("dictionaryDbService findByContext", { signalId, dictionaryName });
    const cachedId = await this.dictionaryCacheService.getDictionaryId(signalId, dictionaryName);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IDictionaryRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ signalId, dictionaryName }) as IDictionaryRow | null;
    if (result) {
      await this.dictionaryCacheService.setDictionaryId(result);
    }
    return result;
  };
}

export default DictionaryDbService;
