import BaseCRUD from "../../common/BaseCRUD";
import { IBreakevenRow, BreakevenModel } from "../../../schema/Breakeven.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import BreakevenCacheService from "../cache/BreakevenCacheService";
import { BreakevenData } from "backtest-kit";

export class BreakevenDbService extends BaseCRUD(BreakevenModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly breakevenCacheService = inject<BreakevenCacheService>(TYPES.breakevenCacheService);

  public upsert = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    signalId: string,
    payload: BreakevenData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("breakevenDbService upsert", { symbol, strategyName, exchangeName, signalId, when });
    const repo = await this.repo<IBreakevenRow>();
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({ symbol, strategyName, exchangeName, signalId, payload, when: when.getTime() })
      .orUpdate(["payload", "when"], ["symbol", "strategyName", "exchangeName", "signalId"])
      .returning("*")
      .execute();
    const result = raw[0] as IBreakevenRow;
    await this.breakevenCacheService.setBreakevenId(result);
  };

  public findByContext = async (
    symbol: string,
    strategyName: string,
    exchangeName: string,
    signalId: string,
  ): Promise<IBreakevenRow | null> => {
    this.loggerService.log("breakevenDbService findByContext", { symbol, strategyName, exchangeName, signalId });
    const cachedId = await this.breakevenCacheService.getBreakevenId(symbol, strategyName, exchangeName, signalId);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as IBreakevenRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ symbol, strategyName, exchangeName, signalId }) as IBreakevenRow | null;
    if (result) {
      await this.breakevenCacheService.setBreakevenId(result);
    }
    return result;
  };
}

export default BreakevenDbService;
