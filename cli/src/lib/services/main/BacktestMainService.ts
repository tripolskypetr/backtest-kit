import { Backtest, listExchangeSchema, listFrameSchema, listStrategySchema } from "backtest-kit";
import { singleshot } from "functools-kit";
import { getArgs } from "../../../helpers/getArgs";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ExchangeLogicService from "../logic/ExchangeLogicService";
import FrameLogicService from "../logic/FrameLogicService";
import ResolveService from "../base/ResolveService";

export class BacktestMainService {

  private loggerService = inject<LoggerService>(TYPES.loggerService);

  private exchangeLogicService = inject<ExchangeLogicService>(TYPES.exchangeLogicService);
  private frameLogicService = inject<FrameLogicService>(TYPES.frameLogicService);

  private resolveService = inject<ResolveService>(TYPES.resolveService);

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

    await this.resolveService.attachEntryPoint(entryPoint);

    {
        this.exchangeLogicService.init();
        this.frameLogicService.init();
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
