import { IStrategyRow } from "../../../schema/Strategy.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { StrategyData } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (symbol: string, strategyName: string, exchangeName: string) => {
    return `${symbol}/${strategyName}/${exchangeName}`;
}

export class StrategyDataService extends BaseStorage("backtest-kit/strategy-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    payload: StrategyData | null,
  ): Promise<void> => {
    this.loggerService.log("strategyDataService upsert", { symbol, strategyName, exchangeName });
    const key = GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName);
    const now = new Date();
    const row: IStrategyRow = {
      id: key,
      symbol,
      strategyName,
      exchangeName,
      payload: payload as StrategyData,
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
  ): Promise<IStrategyRow | null> => {
    this.loggerService.log("strategyDataService findByContext", { symbol, strategyName, exchangeName });
    return await this.get<IStrategyRow>(GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName));
  };
}

export default StrategyDataService;
