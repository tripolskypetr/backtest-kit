import BaseCRUD from "../../common/BaseCRUD";
import { IRiskRow, RiskModel } from "../../../schema/Risk.schema";
import { readTransform } from "../../../utils/readTransform";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import RiskCacheService from "../cache/RiskCacheService";
import { RiskData } from "backtest-kit";

export class RiskDbService extends BaseCRUD(RiskModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly riskCacheService = inject<RiskCacheService>(TYPES.riskCacheService);

  public upsert = async (
    riskName: string,
    exchangeName: string,
    positions: RiskData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("riskDbService upsert", { riskName, exchangeName, when });
    const filter = { riskName, exchangeName };
    const document = await RiskModel.findOneAndUpdate(
      filter,
      { $set: { positions, when: when.getTime() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as IRiskRow;
    await this.riskCacheService.setRiskId(result);
  };

  public findByContext = async (
    riskName: string,
    exchangeName: string,
  ): Promise<IRiskRow | null> => {
    this.loggerService.log("riskDbService findByContext", { riskName, exchangeName });
    const cachedId = await this.riskCacheService.getRiskId(riskName, exchangeName);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as IRiskRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ riskName, exchangeName }) as IRiskRow | null;
    if (result) {
      await this.riskCacheService.setRiskId(result);
    }
    return result;
  };
}

export default RiskDbService;
