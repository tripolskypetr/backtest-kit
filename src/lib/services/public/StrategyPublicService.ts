import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import ExecutionContextService from "../context/ExecutionContextService";
import { IStrategyTickResult } from "../../../interfaces/Strategy.interface";
import StrategyConnectionService from "../connection/StrategyConnectionService";

export class StrategyPublicService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly strategyConnectionService =
    inject<StrategyConnectionService>(TYPES.strategyConnectionService);

  public tick = async (
    symbol: string,
    when: Date,
    backtest: boolean
  ): Promise<IStrategyTickResult> => {
    this.loggerService.log("strategyPublicService tick", {
      symbol,
      when,
      backtest,
    });
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.strategyConnectionService.tick();
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };
}

export default StrategyPublicService;
