import { Backtest, listenError, overrideStrategySchema } from "backtest-kit";

import { getArgs } from "../utils/getArgs.mjs";

import ActionName from "../enum/ActionName.mjs";

const beginBacktest = async () => {
  const { symbol, frameName, strategyName, exchangeName } = getArgs();

  overrideStrategySchema({
    strategyName,
    actions: [
      ActionName.BacktestPartialProfitTakingAction,
      ActionName.BacktestLowerStopOnBreakevenAction,
      ActionName.BacktestPositionMonitorAction,
    ],
  });

  Backtest.background(symbol, {
    strategyName,
    frameName,
    exchangeName,
  });
};

const beginPaper = async () => {
  throw new Error("Todo: implement");
};

const beginLive = async () => {
  throw new Error("Todo: implement");
};

const main = async () => {
  const { backtest, live, paper } = getArgs();

  if (backtest) {
    await beginBacktest();
  }

  if (paper) {
    await beginPaper();
  }

  if (live) {
    await beginLive();
  }
};

listenError(console.log);

main();
