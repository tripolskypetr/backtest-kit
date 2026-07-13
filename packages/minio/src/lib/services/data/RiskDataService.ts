import { IRiskRow } from "../../../schema/Risk.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { RiskData } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (riskName: string, exchangeName: string) => {
    return `${riskName}/${exchangeName}`;
}

export class RiskDataService extends BaseStorage("backtest-kit/risk-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (
    riskName: string,
    exchangeName: string,
    positions: RiskData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("riskDataService upsert", { riskName, exchangeName, when });
    const key = GET_STORAGE_KEY_FN(riskName, exchangeName);
    const now = new Date();
    const row: IRiskRow = {
      id: key,
      riskName,
      exchangeName,
      positions,
      when: when.getTime(),
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByContext = async (
    riskName: string,
    exchangeName: string,
  ): Promise<IRiskRow | null> => {
    this.loggerService.log("riskDataService findByContext", { riskName, exchangeName });
    return await this.get<IRiskRow>(GET_STORAGE_KEY_FN(riskName, exchangeName));
  };
}

export default RiskDataService;
