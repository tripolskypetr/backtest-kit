import { singlerun, sleep } from "functools-kit";
import backtest from "../lib/index";

export interface IRunConfig {
  symbol: string;
  interval: number;
}

interface IRunInstance {
  config: IRunConfig;
  tickCount: number;
  intervalId: NodeJS.Timeout;
  doWork: ReturnType<typeof singlerun>;
}

const instances = new Map<string, IRunInstance>();

export const startRun = (config: IRunConfig) => {
  const { symbol, interval } = config;

  // Останавливаем предыдущий инстанс для этого символа
  if (instances.has(symbol)) {
    stopRun(symbol);
  }

  const doWork = singlerun(async () => {
    const now = new Date();
    const result = await backtest.strategyPublicService.tick(symbol, now, false);

    const instance = instances.get(symbol);
    if (instance) {
      instance.tickCount++;
    }

    await sleep(interval);

    return result;
  });

  const intervalId = setInterval(doWork, interval);

  instances.set(symbol, {
    config,
    tickCount: 0,
    intervalId,
    doWork,
  });
};

export const stopRun = (symbol: string) => {
  const instance = instances.get(symbol);
  if (instance) {
    clearInterval(instance.intervalId);
    instances.delete(symbol);
  }
};

export const stopAll = () => {
  instances.forEach((instance) => {
    clearInterval(instance.intervalId);
  });
  instances.clear();
};

export default { startRun, stopRun, stopAll };
