import {
  Backtest,
  Live,
  Walker,
  listenDoneBacktest,
  listenDoneLive,
  listenDoneWalker,
  shutdown,
} from "backtest-kit";
import { compose, singleshot } from "functools-kit";
import { getArgs, getPositionals } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import notifyShutdown from "../utils/notifyShutdown";
import cli from "../lib";
import { Setup } from "../classes/Setup";
import { flush } from "./flush";
import path from "path";
import dotenv from "dotenv";

type Mode = "backtest" | "live" | "paper" | "walker";

const MODE_MODULE: Record<Mode, string> = {
  backtest: "backtest.module",
  live: "live.module",
  paper: "paper.module",
  walker: "walker.module",
};

const resolveMode = (values: Record<string, unknown>): Mode | null => {
  const enabled = (<Mode[]>["backtest", "live", "paper", "walker"]).filter(
    (mode) => Boolean(values[mode]),
  );
  if (enabled.length !== 1) {
    return null;
  }
  return enabled[0];
};

const stopBacktestList = async () => {
  for (const item of await Backtest.list()) {
    if (item.status === "fulfilled") {
      continue;
    }
    Backtest.stop(item.symbol, {
      exchangeName: item.exchangeName,
      strategyName: item.strategyName,
      frameName: item.frameName,
    });
  }
};

const stopLiveList = async () => {
  for (const item of await Live.list()) {
    if (item.status === "fulfilled") {
      continue;
    }
    Live.stop(item.symbol, {
      exchangeName: item.exchangeName,
      strategyName: item.strategyName,
    });
  }
};

const stopWalkerList = async () => {
  for (const item of await Walker.list()) {
    if (item.status === "fulfilled") {
      continue;
    }
    Walker.stop(item.symbol, { walkerName: item.walkerName });
  }
};

const MODE_STOP: Record<Mode, () => Promise<void>> = {
  backtest: stopBacktestList,
  live: stopLiveList,
  paper: stopLiveList,
  walker: stopWalkerList,
};

const listenFinish = singleshot(() => {
  let disposeRef: Function;
  const unBacktest = listenDoneBacktest(() => {
    console.log("Backtest trading finished");
    disposeRef && disposeRef();
  });
  const unLive = listenDoneLive(() => {
    console.log("Live trading finished");
    disposeRef && disposeRef();
  });
  const unWalker = listenDoneWalker(() => {
    console.log("Walker comparison finished");
    disposeRef && disposeRef();
  });
  disposeRef = compose(
    () => unBacktest(),
    () => unLive(),
    () => unWalker(),
  );
  shutdown();
});

const createGracefulShutdown = (mode: Mode) => {
  const stop = MODE_STOP[mode];
  const handler = singleshot(async () => {
    process.off("SIGINT", handler);
    notifyShutdown();
    await stop();
  });
  return singleshot(() => {
    process.on("SIGINT", handler);
  });
};

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.entry) {
    return;
  }

  const mode = resolveMode(values);

  if (!mode) {
    console.error(
      "--entry requires exactly one of --backtest, --live, --paper, --walker",
    );
    process.exit(1);
    return;
  }

  const entryPoints = getPositionals();

  if (!entryPoints.length) {
    throw new Error("At least one entry point is required");
  }

  await cli.configConnectionService.loadConfig("setup.config");

  {
    const loader = await cli.configConnectionService.loadConfig("loader.config");
    if (typeof loader === "function") {
      await loader();
    }
    if (typeof loader?.loader === "function") {
      await loader.loader();
    }
  }

  {
    await cli.configService.waitForInit();
    Setup.enable();
  }

  cli.frontendProviderService.connect();
  cli.telegramProviderService.connect();

  const cwd = process.cwd();

  {
    dotenv.config({ path: path.join(cwd, '.env'), override: true, quiet: true });
  }

  if (entryPoints.length === 1) {
    const absolutePath = path.resolve(entryPoints[0]);
    const moduleRoot = path.dirname(absolutePath);
    process.chdir(moduleRoot);
    cwd !== moduleRoot && Setup.update();
    dotenv.config({ path: path.join(moduleRoot, '.env'), override: true, quiet: true });
  }

  for (const entryPoint of entryPoints) {
    if (values.noFlush) {
      continue;
    }
    await flush(entryPoint);
  }

  await cli.moduleConnectionService.loadModule(MODE_MODULE[mode]);

  listenFinish();
  createGracefulShutdown(mode)();

  for (const entryPoint of entryPoints) {
    await cli.resolveService.attachEntry(entryPoint);
  }
};

main();
