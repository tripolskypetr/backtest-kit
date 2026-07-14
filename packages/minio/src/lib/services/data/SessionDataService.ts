import { ISessionRow } from "../../../schema/Session.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { SessionData } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (strategyName: string, exchangeName: string, frameName: string, symbol: string, backtest: boolean) => {
    return `${strategyName}/${exchangeName}/${frameName}/${symbol}/${backtest}`;
}

export class SessionDataService extends BaseStorage("backtest-kit/session-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (
    strategyName: string,
    exchangeName: string,
    frameName: string,
    symbol: string,
    backtest: boolean,
    payload: SessionData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("sessionDataService upsert", { strategyName, exchangeName, frameName, symbol, backtest, when });
    const key = GET_STORAGE_KEY_FN(strategyName, exchangeName, frameName, symbol, backtest);
    const now = new Date();
    const row: ISessionRow = {
      id: key,
      strategyName,
      exchangeName,
      frameName,
      symbol,
      backtest,
      payload,
      when: when.getTime(),
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByContext = async (
    strategyName: string,
    exchangeName: string,
    frameName: string,
    symbol: string,
    backtest: boolean,
  ): Promise<ISessionRow | null> => {
    this.loggerService.log("sessionDataService findByContext", { strategyName, exchangeName, frameName, symbol, backtest });
    return await this.get<ISessionRow>(GET_STORAGE_KEY_FN(strategyName, exchangeName, frameName, symbol, backtest));
  };
}

export default SessionDataService;
