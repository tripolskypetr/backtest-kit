import BaseCRUD from "../../common/BaseCRUD";
import { IRiskRow, RiskModel } from "../../../schema/Risk.schema";
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
    const repo = await this.repo<IRiskRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ riskName, exchangeName, positions, when: when.getTime() })
      .orUpdate(["positions", "when"], ["riskName", "exchangeName"])
      .returning("*")
      .execute();
    const result = raw[0] as IRiskRow;
    await this.riskCacheService.setRiskId(result);
  };

  public findByContext = async (
    riskName: string,
    exchangeName: string,
  ): Promise<IRiskRow | null> => {
    this.loggerService.log("riskDbService findByContext", { riskName, exchangeName });
    const cachedId = await this.riskCacheService.getRiskId(riskName, exchangeName);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IRiskRow | null;
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
