import { IRecentRow } from "../../../schema/Recent.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { IPublicSignalRow } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => {
    return `${symbol}/${strategyName}/${exchangeName}/${frameName}/${backtest}`;
}

export class RecentDataService extends BaseStorage("backtest-kit/recent-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    frameName: string,
    backtest: boolean,
    payload: IPublicSignalRow,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("recentDataService upsert", { symbol, strategyName, exchangeName, frameName, backtest, when });
    const key = GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest);
    const now = new Date();
    const row: IRecentRow = {
      id: key,
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
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
    frameName: string,
    backtest: boolean,
  ): Promise<IRecentRow | null> => {
    this.loggerService.log("recentDataService findByContext", { symbol, strategyName, exchangeName, frameName, backtest });
    return await this.get<IRecentRow>(GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest));
  };
}

export default RecentDataService;
