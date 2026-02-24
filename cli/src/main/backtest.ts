import { Backtest } from "backtest-kit";
import { getArgs } from "../helpers/getArgs";
import { singleshot } from "functools-kit";
import notifyShutdown from "../utils/notifyShutdown";
import getEntry from "../helpers/getEntry";
import cli from "../lib";

const BEFORE_EXIT_FN = singleshot(async () => {
  process.off("SIGINT", BEFORE_EXIT_FN);

  const [running = null] = await Backtest.list();

  if (!running) {
    return;
  }

  notifyShutdown();

  const { exchangeName, frameName, strategyName, symbol, status } = running;

  if (status === "fulfilled") {
    return;
  }

  Backtest.stop(symbol, {
    exchangeName,
    strategyName,
    frameName,
  });
});

export const listenGracefulShutdown = singleshot(() => {
  process.on("SIGINT", BEFORE_EXIT_FN);
})

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }
  const { values } = getArgs();
  if (!values.backtest) {
    return;
  }
  await cli.backtestMainService.connect();
  listenGracefulShutdown();
};

main();
