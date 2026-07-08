import BaseCRUD from "../../common/BaseCRUD";
import { IRecentRow, RecentModel } from "../../../schema/Recent.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import RecentCacheService from "../cache/RecentCacheService";
import { IPublicSignalRow } from "backtest-kit";

export class RecentDbService extends BaseCRUD(RecentModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly recentCacheService = inject<RecentCacheService>(TYPES.recentCacheService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    frameName: string,
    backtest: boolean,
    payload: IPublicSignalRow,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("recentDbService upsert", { symbol, strategyName, exchangeName, frameName, backtest, when });
    const repo = await this.repo<IRecentRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ symbol, strategyName, exchangeName, frameName, backtest, payload, when: when.getTime() })
      .orUpdate(["payload", "when"], ["symbol", "strategyName", "exchangeName", "frameName", "backtest"])
      .returning("*")
      .execute();
    const result = raw[0] as IRecentRow;
    await this.recentCacheService.setRecentId(result);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    frameName: string,
    backtest: boolean,
  ): Promise<IRecentRow | null> => {
    this.loggerService.log("recentDbService findByContext", { symbol, strategyName, exchangeName, frameName, backtest });
    const cachedId = await this.recentCacheService.getRecentId(symbol, strategyName, exchangeName, frameName, backtest);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IRecentRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ symbol, strategyName, exchangeName, frameName, backtest }) as IRecentRow | null;
    if (result) {
      await this.recentCacheService.setRecentId(result);
    }
    return result;
  };
}

export default RecentDbService;
