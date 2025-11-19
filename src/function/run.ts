import { singlerun, sleep } from "functools-kit";
import backtest from "../lib/index";

export interface IRunConfig {
  symbol: string;
  interval: number;
}

let currentConfig: IRunConfig | null = null;
let tickCount = 0;
let intervalId: NodeJS.Timeout | null = null;

const doWork = singlerun(async () => {
  if (!currentConfig) {
    return;
  }

  const { symbol, interval } = currentConfig;

  const now = new Date();
  const result = await backtest.strategyPublicService.tick(symbol, now, false);

  tickCount++;

  await sleep(interval);

  return result;
});

export const startRun = (config: IRunConfig) => {
  if (intervalId) {
    clearInterval(intervalId);
  }

  currentConfig = config;
  tickCount = 0;

  intervalId = setInterval(doWork, config.interval);
};

export const stopRun = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

export const getStatus = () => {
  return {
    status: doWork.getStatus(),
    config: currentConfig,
    tickCount,
    isRunning: intervalId !== null,
  };
};

export default { startRun, stopRun, getStatus };
