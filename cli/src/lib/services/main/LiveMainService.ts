import { listExchangeSchema, listStrategySchema, Live } from "backtest-kit";
import { singleshot } from "functools-kit";
import { getArgs } from "../../../helpers/getArgs";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";

export class LiveMainService {

  private loggerService = inject<LoggerService>(TYPES.loggerService);

  protected init = singleshot(async () => {
    this.loggerService.log("liveMainService init");
    const { values, positionals } = getArgs();

    if (!values.live) {
      return;
    }

    const [entryPoint = null] = positionals;

    if (!entryPoint) {
      throw new Error("Entry point is required");
    }

    const [defaultStrategyName = null] = await listStrategySchema();
    const [defaultExchangeName = null] = await listExchangeSchema();

    const strategyName =
      <string>values.strategy || defaultStrategyName?.strategyName;

    if (!strategyName) {
      throw new Error("Strategy name is required");
    }

    const exchangeName =
      <string>values.exchange || defaultExchangeName?.exchangeName;

    if (!exchangeName) {
      throw new Error("Exchange name is required");
    }

    Live.background("BTCUSDT", {
      strategyName,
      exchangeName,
    });
  });
}

export default LiveMainService;
