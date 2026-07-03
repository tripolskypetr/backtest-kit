import BaseCRUD from "../../common/BaseCRUD";
import { ISessionRow, SessionModel } from "../../../schema/Session.schema";
import { readTransform } from "../../../utils/readTransform";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import SessionCacheService from "../cache/SessionCacheService";
import { SessionData } from "backtest-kit";

export class SessionDbService extends BaseCRUD(SessionModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly sessionCacheService = inject<SessionCacheService>(TYPES.sessionCacheService);

  public upsert = async (
    strategyName: string,
    exchangeName: string,
    frameName: string,
    symbol: string,
    backtest: boolean,
    payload: SessionData,
    when: Date,
  ): Promise<void> => {
    this.loggerService.log("sessionDbService upsert", { strategyName, exchangeName, frameName, symbol, backtest, when });
    const filter = { strategyName, exchangeName, frameName, symbol, backtest };
    const document = await SessionModel.findOneAndUpdate(
      filter,
      { $set: { payload, when: when.getTime() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as ISessionRow;
    await this.sessionCacheService.setSessionId(result);
  };

  public findByContext = async (
    strategyName: string,
    exchangeName: string,
    frameName: string,
    symbol: string,
    backtest: boolean,
  ): Promise<ISessionRow | null> => {
    this.loggerService.log("sessionDbService findByContext", { strategyName, exchangeName, frameName, symbol, backtest });
    const cachedId = await this.sessionCacheService.getSessionId(strategyName, exchangeName, frameName, symbol, backtest);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as ISessionRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ strategyName, exchangeName, frameName, symbol, backtest }) as ISessionRow | null;
    if (result) {
      await this.sessionCacheService.setSessionId(result);
    }
    return result;
  };
}

export default SessionDbService;
