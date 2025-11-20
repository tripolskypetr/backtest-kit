import backtest from "../lib";

const BACKTEST_METHOD_NAME_RUN = "BacktestUtils.run";

export class BacktestUtils {
  public run = (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_RUN, {
      symbol,
      context,
    });
    return backtest.backtestGlobalService.run(symbol, context);
  };
}

export const Backtest = new BacktestUtils();
