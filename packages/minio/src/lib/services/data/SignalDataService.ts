import { ISignalRowDoc } from "../../../schema/Signal.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { ISignalRow } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (symbol: string, strategyName: string, exchangeName: string) => {
    return `${symbol}/${strategyName}/${exchangeName}`;
}

export class SignalDataService extends BaseStorage("backtest-kit/signal-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    payload: ISignalRow | null,
  ): Promise<void> => {
    this.loggerService.log("signalDataService upsert", { symbol, strategyName, exchangeName });
    const key = GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName);
    const now = new Date();
    const row: ISignalRowDoc = {
      id: key,
      symbol,
      strategyName,
      exchangeName,
      payload: payload as ISignalRow,
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
  ): Promise<ISignalRowDoc | null> => {
    this.loggerService.log("signalDataService findByContext", { symbol, strategyName, exchangeName });
    return await this.get<ISignalRowDoc>(GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName));
  };
}

export default SignalDataService;
