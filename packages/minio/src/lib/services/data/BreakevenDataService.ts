import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { BreakevenData } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";
import { IBreakevenRow } from "../../../schema/Breakeven.schema";

const GET_STORAGE_KEY_FN = (symbol: string, strategyName: string, exchangeName: string, signalId: string) => {
    return `${symbol}/${strategyName}/${exchangeName}/${signalId}`;
}

export class BreakevenDataService extends BaseStorage("backtest-kit/breakeven-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    signalId: string,
    payload: BreakevenData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("breakevenDataService upsert", { symbol, strategyName, exchangeName, signalId, when });
    const key = GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName, signalId);
    const now = new Date();
    const row: IBreakevenRow = {
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
  ): Promise<IBreakevenRow | null> => {
    this.loggerService.log("breakevenDataService findByContext", { symbol, strategyName, exchangeName, signalId });
    return await this.get<IBreakevenRow>(GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName, signalId));
  };
}

export default BreakevenDataService;
