import {
  Backtest,
  Live,
  Walker,
  listenDoneBacktest,
  listenDoneLive,
  listenDoneWalker,
  shutdown,
} from "tradeforge";
import { compose, singleshot } from "functools-kit";
import { getArgs, getPositionals } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import notifyShutdown from "../utils/notifyShutdown";
import cli from "../lib";
import { Setup } from "../classes/Setup";
import { flush } from "./flush";
import path from "path";
import dotenv from "dotenv";
import { getEntrySubject } from "../config/emitters";
import notifyKill, { kill } from "../utils/notifyKill";

type Mode = "backtest" | "live" | "paper" | "walker" | "main";

const MODE_MODULE: Record<Mode, string> = {
  backtest: "backtest.module",
  live: "live.module",
  paper: "paper.module",
  walker: "walker.module",
  main: "main.module",
};

const MODE_LIST: Mode[] = ["backtest", "live", "paper", "walker", "main"];

const resolveMode = (values: Record<string, unknown>): Mode | null => {
  if (MODE_LIST.filter((mode) => values[mode]).length > 1) {
    return null;
  }
  if (values.main) {
    return "main";
  }
  if (values.backtest) {
    return "backtest";
  }
  if (values.live) {
    return "live";
  }
  if (values.paper) {
    return "paper";
  }
  if (values.walker) {
    return "walker";
  }
  return null;
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

const stopMain = async () => {
  await stopBacktestList();
  await stopLiveList();
  await stopWalkerList();
};

const MODE_STOP: Record<Mode, () => Promise<void>> = {
  backtest: stopBacktestList,
  live: stopLiveList,
  paper: stopLiveList,
  walker: stopWalkerList,
  main: stopMain,
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
    notifyKill();
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
      "--entry requires exactly one of --backtest, --live, --paper, --walker, --main",
    );
    kill(1);
    return;
  }

  const entryPoints = getPositionals();

  if (mode !== "main" && !entryPoints.length) {
    throw new Error("At least one entry point is required");
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

  cli.frontendProviderService.connect();
  cli.telegramProviderService.connect();

  const cwd = process.cwd();

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
    const absolutePath = path.resolve(cwd, entryPoint);
    await flush(absolutePath);
  }

  await cli.moduleConnectionService.loadModule(MODE_MODULE[mode]);

  listenFinish();

  {
    const listenShutdown = createGracefulShutdown(mode);
    listenShutdown();
  }

  let absolutePath: string;

  for (const entryPoint of entryPoints) {
    absolutePath = path.resolve(cwd, entryPoint);
    await cli.resolveService.attachEntry(absolutePath);
  }

  if (mode === "main") {
    return;
  }

  await getEntrySubject().next(absolutePath);
};

main();
