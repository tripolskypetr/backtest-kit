import { singlerun, sleep } from "functools-kit";
import backtest from "../lib/index";

/**
 * @deprecated Use liveLogicPublicService.run() instead.
 * Configuration for legacy run API.
 */
export interface IRunConfig {
  /** Trading pair symbol */
  symbol: string;
  /** Tick interval in milliseconds */
  interval: number;
}

/**
 * Internal run instance data.
 * @internal
 */
interface IRunInstance {
  config: IRunConfig;
  tickCount: number;
  intervalId: NodeJS.Timeout;
  doWork: ReturnType<typeof singlerun>;
}

const instances = new Map<string, IRunInstance>();

/**
 * @deprecated Use liveLogicPublicService.run() instead.
 * Starts live trading for a symbol using setInterval.
 *
 * Legacy API - replaced by async generator approach for better
 * crash recovery and state management.
 *
 * @param config - Run configuration
 */
export function startRun(config: IRunConfig) {
  const { symbol, interval } = config;

  // Останавливаем предыдущий инстанс для этого символа
  if (instances.has(symbol)) {
    stopRun(symbol);
  }

  const doWork = singlerun(async () => {
    const now = new Date();
    const result = await backtest.strategyGlobalService.tick(symbol, now, false);

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

/**
 * @deprecated Use liveLogicPublicService.run() instead.
 * Stops live trading for a symbol.
 *
 * @param symbol - Trading pair symbol to stop
 */
export function stopRun(symbol: string) {
  const instance = instances.get(symbol);
  if (instance) {
    clearInterval(instance.intervalId);
    instances.delete(symbol);
  }
};

/**
 * @deprecated Use liveLogicPublicService.run() instead.
 * Stops all running live trading instances.
 */
export function stopAll() {
  instances.forEach((instance) => {
    clearInterval(instance.intervalId);
  });
  instances.clear();
};

export default { startRun, stopRun, stopAll };
