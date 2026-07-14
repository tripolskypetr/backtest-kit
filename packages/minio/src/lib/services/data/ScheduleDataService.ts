import { IScheduleRow } from "../../../schema/Schedule.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { IScheduledSignalRow } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (symbol: string, strategyName: string, exchangeName: string) => {
    return `${symbol}/${strategyName}/${exchangeName}`;
}

export class ScheduleDataService extends BaseStorage("backtest-kit/schedule-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    payload: IScheduledSignalRow | null,
  ): Promise<void> => {
    this.loggerService.log("scheduleDataService upsert", { symbol, strategyName, exchangeName });
    const key = GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName);
    const now = new Date();
    const row: IScheduleRow = {
      id: key,
      symbol,
      strategyName,
      exchangeName,
      payload: payload as IScheduledSignalRow,
      createDate: now,
      updatedDate: now,
    };
    await this.set(key, row);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
  ): Promise<IScheduleRow | null> => {
    this.loggerService.log("scheduleDataService findByContext", { symbol, strategyName, exchangeName });
    return await this.get<IScheduleRow>(GET_STORAGE_KEY_FN(symbol, strategyName, exchangeName));
  };
}

export default ScheduleDataService;
