import BaseCRUD from "../../common/BaseCRUD";
import { IScheduleRow, ScheduleModel } from "../../../schema/Schedule.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import ScheduleCacheService from "../cache/ScheduleCacheService";
import { IScheduledSignalRow } from "backtest-kit";

export class ScheduleDbService extends BaseCRUD(ScheduleModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly scheduleCacheService = inject<ScheduleCacheService>(TYPES.scheduleCacheService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    payload: IScheduledSignalRow | null,
  ): Promise<void> => {
    this.loggerService.log("scheduleDbService upsert", { symbol, strategyName, exchangeName });
    const repo = await this.repo<IScheduleRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ symbol, strategyName, exchangeName, payload })
      .orUpdate(["payload"], ["symbol", "strategyName", "exchangeName"])
      .returning("*")
      .execute();
    const result = raw[0] as IScheduleRow;
    await this.scheduleCacheService.setScheduleId(result);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
  ): Promise<IScheduleRow | null> => {
    this.loggerService.log("scheduleDbService findByContext", { symbol, strategyName, exchangeName });
    const cachedId = await this.scheduleCacheService.getScheduleId(symbol, strategyName, exchangeName);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IScheduleRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ symbol, strategyName, exchangeName }) as IScheduleRow | null;
    if (result) {
      await this.scheduleCacheService.setScheduleId(result);
    }
    return result;
  };
}

export default ScheduleDbService;
