import {
  Backtest,
  listExchangeSchema,
  listFrameSchema,
  listStrategySchema,
} from "backtest-kit";
import { getArgs } from "../helpers/getArgs";
import { singleshot } from "functools-kit";
import notifyShutdown from "../utils/notifyShutdown";

const BEFORE_EXIT_FN = singleshot(async () => {
  process.off("SIGINT", BEFORE_EXIT_FN);
  notifyShutdown();
  const { values } = getArgs();
  const symbol = <string>values.symbol || "BTCUSDT";
  const [defaultStrategyName = null] = await listStrategySchema();
  const [defaultExchangeName = null] = await listExchangeSchema();
  const [defaultFrameName = null] = await listFrameSchema();

  const strategyName =
    <string>values.strategy || defaultStrategyName?.strategyName;

  const exchangeName =
    <string>values.exchange || defaultExchangeName?.exchangeName;

  const frameName = <string>values.frame || defaultFrameName?.frameName;

  if (!strategyName || !exchangeName || !frameName) {
    return;
  }

  Backtest.stop(symbol, {
    exchangeName,
    strategyName,
    frameName,
  });
});

export const main = async () => {
  const { values } = getArgs();
  if (!values.backtest) {
    return;
  }
  process.on("SIGINT", BEFORE_EXIT_FN);
};

main();
