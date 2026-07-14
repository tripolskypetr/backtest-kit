import { IPartialRow } from "../../../schema/Partial.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { PartialData } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (symbol: string, strategyName: string, exchangeName: string, signalId: string) => {
    return `${symbol}/${strategyName}/${exchangeName}/${signalId}`;
}

export class PartialDataService extends BaseStorage("backtest-kit/partial-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    signalId: string,
    payload: PartialData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("partialDataService upsert", { symbol, strategyName, exchangeName, signalId, when });
    const key = GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName, signalId);
    const now = new Date();
    const row: IPartialRow = {
      id: key,
      symbol,
      strategyName,
      exchangeName,
      signalId,
      payload,
      when: when.getTime(),
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    signalId: string,
  ): Promise<IPartialRow | null> => {
    this.loggerService.log("partialDataService findByContext", { symbol, strategyName, exchangeName, signalId });
    return await this.get<IPartialRow>(GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName, signalId));
  };
}

export default PartialDataService;
