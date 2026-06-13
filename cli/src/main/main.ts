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
import notifyKill, { kill } from "../utils/notifyKill";

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

const stopMain = async () => {
  await stopBacktestList();
  await stopLiveList();
  await stopWalkerList();
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

const BEFORE_EXIT_FN = singleshot(async () => {
  process.off("SIGINT", BEFORE_EXIT_FN);
  notifyShutdown();
  notifyKill();
  await stopMain();
});

export const listenGracefulShutdown = singleshot(() => {
  process.on("SIGINT", BEFORE_EXIT_FN);
});

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.main) {
    return;
  }

  if (values.entry) {
    return;
  }

  const [entryPoint = null] = getPositionals();

  if (!entryPoint) {
    throw new Error("Entry point is required");
  }

  {
    const cwd = process.cwd();
    dotenv.config({ path: path.join(cwd, '.env'), override: true, quiet: true });
  }

  await cli.configConnectionService.loadConfig("setup.config");

  {
    const loader = await cli.configConnectionService.loadConfig("loader.config");
    try {
      if (typeof loader === "function") {
        await loader();
      }
      if (typeof loader?.loader === "function") {
        await loader.loader();
      }
    } catch (error) {
      console.error("Module loader failed", error);
      kill(-1);
      return;
    }
  }

  {
    await cli.configService.waitForInit();
    Setup.enable();
  }

  const cwd = process.cwd();

  {
    const absolutePath = path.resolve(entryPoint);
    const moduleRoot = path.dirname(absolutePath);
    process.chdir(moduleRoot);
    cwd !== moduleRoot && Setup.update();
    dotenv.config({ path: path.join(moduleRoot, '.env'), override: true, quiet: true });
  }

  if (!values.noFlush) {
    await flush(path.resolve(cwd, entryPoint));
  }

  await cli.moduleConnectionService.loadModule("main.module");

  listenFinish();
  listenGracefulShutdown();

  await cli.resolveService.attachEntry(path.resolve(cwd, entryPoint));
};

main();
