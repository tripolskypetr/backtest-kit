import { listenDoneLive, Live } from "backtest-kit";
import { getArgs } from "../helpers/getArgs";
import { singleshot } from "functools-kit";
import notifyShutdown from "../utils/notifyShutdown";
import cli from "../lib";
import getEntry from "../helpers/getEntry";

const BEFORE_EXIT_FN = singleshot(async () => {
  process.off("SIGINT", BEFORE_EXIT_FN);

  const [running = null] = await Live.list();

  if (!running) {
    return;
  }

  notifyShutdown();

  const { exchangeName, strategyName, symbol, status } = running;

  if (status === "fulfilled") {
    return;
  }

  Live.stop(symbol, {
    exchangeName,
    strategyName,
  });

  listenDoneLive(cli.liveProviderService.disable);
});

export const listenGracefulShutdown = singleshot(() => {
  process.on("SIGINT", BEFORE_EXIT_FN);
})

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }
  const { values } = getArgs();
  if (!values.live) {
    return;
  }
  await cli.liveMainService.connect();
  listenGracefulShutdown();
};

main();
