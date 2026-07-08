import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IRiskRow } from "../../../schema/Risk.schema";

const REDIS_KEY = "risk_cache";

export class RiskCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(riskName: string, exchangeName: string): string {
    return `${exchangeName}:${riskName}`;
  }

  public async hasRiskId(riskName: string, exchangeName: string): Promise<boolean> {
    this.loggerService.log("riskCacheService hasRiskId", { riskName, exchangeName });
    return await this.has(this._cacheKey(riskName, exchangeName));
  }

  public async getRiskId(riskName: string, exchangeName: string): Promise<string | null> {
    this.loggerService.log("riskCacheService getRiskId", { riskName, exchangeName });
    const id = <string>await super.get(this._cacheKey(riskName, exchangeName));
    return id ?? null;
  }

  public async setRiskId(row: IRiskRow): Promise<string> {
    this.loggerService.log("riskCacheService setRiskId", {
      riskName: row.riskName,
      exchangeName: row.exchangeName,
    });
    await super.set(this._cacheKey(row.riskName, row.exchangeName), row.id);
    return row.id;
  }
}

export default RiskCacheService;
