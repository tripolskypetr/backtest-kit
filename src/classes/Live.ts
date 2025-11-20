import backtest from "../lib";

const LIVE_METHOD_NAME_RUN = "LiveUtils.run";

export class LiveUtils {
  public run = (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    }
  ) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_RUN, {
      symbol,
      context,
    });
    return backtest.liveGlobalService.run(symbol, context);
  };
}

export const Live = new LiveUtils();
