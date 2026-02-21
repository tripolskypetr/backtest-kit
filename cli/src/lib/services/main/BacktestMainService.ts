import { Backtest, listExchangeSchema, listFrameSchema, listStrategySchema } from "backtest-kit";
import { singleshot } from "functools-kit";
import { getArgs } from "../../../helpers/getArgs";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";

export class BacktestMainService {

  private loggerService = inject<LoggerService>(TYPES.loggerService);

  protected init = singleshot(async () => {
    this.loggerService.log("backtestMainService init");
    const { values, positionals } = getArgs();

    if (!values.backtest) {
      return;
    }

    const [entryPoint = null] = positionals;

    if (!entryPoint) {
      throw new Error("Entry point is required");
    }

    const [defaultStrategyName = null] = await listStrategySchema();
    const [defaultExchangeName = null] = await listExchangeSchema();
    const [defaultFrameName = null] = await listFrameSchema();

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

    const frameName = <string>values.frame || defaultFrameName?.frameName;

    if (!frameName) {
      throw new Error("Frame name is required");
    }

    Backtest.background("BTCUSDT", {
      strategyName,
      frameName,
      exchangeName,
    });
  });
}

export default BacktestMainService;
