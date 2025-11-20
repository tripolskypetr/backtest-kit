import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import StrategyGlobalService from "../../global/StrategyGlobalService";
import { sleep } from "functools-kit";

const TICK_TTL = 1 * 60 * 1_000 + 1;

export class LiveLogicPrivateService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly strategyGlobalService = inject<StrategyGlobalService>(
    TYPES.strategyGlobalService
  );

  public async *run(symbol: string) {
    this.loggerService.log("liveLogicPrivateService run", {
      symbol,
    });

    while (true) {
      const when = new Date();

      const result = await this.strategyGlobalService.tick(symbol, when, false);

      this.loggerService.log("liveLogicPrivateService tick result", {
        symbol,
        action: result.action,
      });

      if (result.action === "active") {
        continue;
      }

      if (result.action === "idle") {
        continue;
      }

      yield result;

      await sleep(TICK_TTL);
    }
  }
}

export default LiveLogicPrivateService;
