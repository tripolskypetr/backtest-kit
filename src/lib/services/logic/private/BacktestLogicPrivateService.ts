import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import { IStrategyTickResult, IStrategyTickResultOpened, IStrategyTickResultScheduled, IStrategyTickResultClosed, IStrategyTickResultCancelled, IStrategyTickResultActive } from "../../../../interfaces/Strategy.interface";
import { ICandleData } from "../../../../interfaces/Exchange.interface";
import StrategyCoreService from "../../core/StrategyCoreService";
import ExchangeCoreService from "../../core/ExchangeCoreService";
import FrameCoreService from "../../core/FrameCoreService";
import { TMethodContextService } from "../../context/MethodContextService";
import {
  progressBacktestEmitter,
  performanceEmitter,
  errorEmitter,
  backtestScheduleOpenSubject,
  signalBacktestEmitter,
  signalEmitter,
} from "../../../../config/emitters";
import { GLOBAL_CONFIG } from "../../../../config/params";
import { and, errorData, getErrorMessage } from "functools-kit";
import ActionCoreService from "../../core/ActionCoreService";

const ACTIVE_CANDLE_INCLUDED = 1;
const SCHEDULE_ACTIVATION_CANDLE_SKIP = 1;

interface IProcessSignalResult {
  iNext?: boolean;
  previousEventTimestamp: number | null;
  closeTimestamp?: number;
  shouldStop?: boolean;
  scheduledYield?: IStrategyTickResultOpened;
  backtestYield?: IStrategyTickResultClosed | IStrategyTickResultCancelled;
}

const EMIT_PROGRESS_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  totalFrames: number,
  processedFrames: number
): Promise<void> => {
  await progressBacktestEmitter.next({
    exchangeName: self.methodContextService.context.exchangeName,
    strategyName: self.methodContextService.context.strategyName,
    symbol,
    totalFrames,
    processedFrames,
    progress: totalFrames > 0 ? processedFrames / totalFrames : 0,
  });
};

const CHECK_STOPPED_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  logMessage: string,
  meta: object
): Promise<boolean> => {
  const stopped = await self.strategyCoreService.getStopped(true, symbol, {
    strategyName: self.methodContextService.context.strategyName,
    exchangeName: self.methodContextService.context.exchangeName,
    frameName: self.methodContextService.context.frameName,
  });
  if (stopped) {
    self.loggerService.info(`backtestLogicPrivateService stopped by user request (${logMessage})`, {
      symbol,
      ...meta,
    });
  }
  return stopped;
};

const TICK_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  when: Date
): Promise<IStrategyTickResult | null> => {
  try {
    return await self.strategyCoreService.tick(symbol, when, true, {
      strategyName: self.methodContextService.context.strategyName,
      exchangeName: self.methodContextService.context.exchangeName,
      frameName: self.methodContextService.context.frameName,
    });
  } catch (error) {
    console.warn(`backtestLogicPrivateService tick failed, skipping timeframe when=${when.toISOString()} symbol=${symbol} strategyName=${self.methodContextService.context.strategyName} exchangeName=${self.methodContextService.context.exchangeName}`);
    self.loggerService.warn("backtestLogicPrivateService tick failed, skipping timeframe", {
      symbol,
      when: when.toISOString(),
      error: errorData(error), message: getErrorMessage(error),
    });
    await errorEmitter.next(error);
    return null;
  }
};

const GET_CANDLES_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  candlesNeeded: number,
  bufferStartTime: Date,
  logMeta: object
): Promise<ICandleData[] | null> => {
  try {
    return await self.exchangeCoreService.getNextCandles(symbol, "1m", candlesNeeded, bufferStartTime, true);
  } catch (error) {
    console.warn(`backtestLogicPrivateService getNextCandles failed symbol=${symbol} strategyName=${self.methodContextService.context.strategyName} exchangeName=${self.methodContextService.context.exchangeName}`);
    self.loggerService.warn("backtestLogicPrivateService getNextCandles failed", {
      symbol,
      candlesNeeded,
      error: errorData(error), message: getErrorMessage(error),
      ...logMeta,
    });
    await errorEmitter.next(error);
    return null;
  }
};

const BACKTEST_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  candles: ICandleData[],
  when: Date,
  context: { strategyName: string; exchangeName: string; frameName: string },
  logMeta: object
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive | null> => {
  try {
    return await self.strategyCoreService.backtest(symbol, candles, when, true, context);
  } catch (error) {
    console.warn(`backtestLogicPrivateService backtest failed when=${when.toISOString()} symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName}`);
    self.loggerService.warn("backtestLogicPrivateService backtest failed", {
      symbol,
      error: errorData(error), message: getErrorMessage(error),
      ...logMeta,
    });
    await errorEmitter.next(error);
    return null;
  }
};

const RUN_INFINITY_CHUNK_LOOP_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  when: Date,
  context: { strategyName: string; exchangeName: string; frameName: string },
  initialResult: IStrategyTickResultActive,
  bufferMs: number,
  signalId: string
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | null> => {
  let backtestResult: IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive = initialResult;
  const CHUNK = GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST;
  let lastChunkCandles: ICandleData[] = [];
  let chunkStart = new Date(initialResult._backtestLastTimestamp + 60_000 - bufferMs);

  while (backtestResult.action === "active") {
    const chunkCandles = await GET_CANDLES_FN(self, symbol, CHUNK, chunkStart, { signalId });
    if (chunkCandles === null) {
      return null;
    }

    if (!chunkCandles.length) {
      await self.strategyCoreService.closePending(true, symbol, context);
      const result = await BACKTEST_FN(self, symbol, lastChunkCandles, when, context, { signalId });
      if (result === null) {
        return null;
      }
      return result.action !== "active" ? result : null;
    }

    self.loggerService.info("backtestLogicPrivateService candles fetched for infinity chunk", {
      symbol,
      signalId,
      candlesCount: chunkCandles.length,
    });

    const chunkResult = await BACKTEST_FN(self, symbol, chunkCandles, when, context, { signalId });
    if (chunkResult === null) {
      return null;
    }

    if (chunkResult.action !== "active") {
      return chunkResult;
    }

    lastChunkCandles = chunkCandles;
    backtestResult = chunkResult;
    chunkStart = new Date(chunkResult._backtestLastTimestamp + 60_000 - bufferMs);
  }

  return null;
};

const EMIT_SIGNAL_PERFORMANCE_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  signalStartTime: number,
  previousEventTimestamp: number | null
): Promise<number> => {
  const signalEndTime = performance.now();
  const currentTimestamp = Date.now();
  await performanceEmitter.next({
    timestamp: currentTimestamp,
    previousTimestamp: previousEventTimestamp,
    metricType: "backtest_signal",
    duration: signalEndTime - signalStartTime,
    strategyName: self.methodContextService.context.strategyName,
    exchangeName: self.methodContextService.context.exchangeName,
    frameName: self.methodContextService.context.frameName,
    symbol,
    backtest: true,
  });
  return currentTimestamp;
};

const EMIT_TIMEFRAME_PERFORMANCE_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  timeframeStartTime: number,
  previousEventTimestamp: number | null
): Promise<number> => {
  const timeframeEndTime = performance.now();
  const currentTimestamp = Date.now();
  await performanceEmitter.next({
    timestamp: currentTimestamp,
    previousTimestamp: previousEventTimestamp,
    metricType: "backtest_timeframe",
    duration: timeframeEndTime - timeframeStartTime,
    strategyName: self.methodContextService.context.strategyName,
    exchangeName: self.methodContextService.context.exchangeName,
    frameName: self.methodContextService.context.frameName,
    symbol,
    backtest: true,
  });
  return currentTimestamp;
};

const PROCESS_SCHEDULED_SIGNAL_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  when: Date,
  result: IStrategyTickResultScheduled,
  previousEventTimestamp: number | null
): Promise<IProcessSignalResult> => {
  const signalStartTime = performance.now();
  const signal = result.signal;

  self.loggerService.info("backtestLogicPrivateService scheduled signal detected", {
    symbol,
    signalId: signal.id,
    priceOpen: signal.priceOpen,
    minuteEstimatedTime: signal.minuteEstimatedTime,
  });

  const bufferMinutes = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - ACTIVE_CANDLE_INCLUDED;
  const bufferStartTime = new Date(when.getTime() - bufferMinutes * 60 * 1000);
  const pendingPhaseMinutes = signal.minuteEstimatedTime === Infinity
    ? GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST
    : signal.minuteEstimatedTime;
  const candlesNeeded = bufferMinutes + GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES + pendingPhaseMinutes + SCHEDULE_ACTIVATION_CANDLE_SKIP;

  const candles = await GET_CANDLES_FN(self, symbol, candlesNeeded, bufferStartTime, { signalId: signal.id, candlesNeeded, bufferMinutes });
  if (candles === null) {
    return { iNext: true, previousEventTimestamp };
  }

  if (!candles.length) {
    return { iNext: true, previousEventTimestamp };
  }

  self.loggerService.info("backtestLogicPrivateService candles fetched for scheduled", {
    symbol,
    signalId: signal.id,
    candlesCount: candles.length,
    candlesNeeded,
  });

  let backtestResult: IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive;

  let unScheduleOpen: Function;
  let scheduleOpenResult: IStrategyTickResultOpened;

  const context = {
    strategyName: self.methodContextService.context.strategyName,
    exchangeName: self.methodContextService.context.exchangeName,
    frameName: self.methodContextService.context.frameName,
  };

  {
    const { strategyName, exchangeName, frameName } = context;

    unScheduleOpen = backtestScheduleOpenSubject.filter((event) => {
      let isOk = true;
      {
        isOk = isOk && event.action === "opened";
        isOk = isOk && event.strategyName === strategyName;
        isOk = isOk && event.exchangeName === exchangeName;
        isOk = isOk && event.frameName === frameName;
        isOk = isOk && event.symbol === symbol;
      }
      return isOk;
    }).connect(async (tick) => {
      scheduleOpenResult = tick;
      await signalEmitter.next(tick);
      await signalBacktestEmitter.next(tick);
      await self.actionCoreService.signalBacktest(true, tick, {
        strategyName,
        exchangeName,
        frameName,
      });
    });
  }

  try {
    const firstResult = await BACKTEST_FN(self, symbol, candles, when, context, { signalId: signal.id });
    if (firstResult === null) {
      return { iNext: true, previousEventTimestamp };
    }
    backtestResult = firstResult;
  } finally {
    unScheduleOpen && unScheduleOpen();
  }

  if (backtestResult.action === "active" && signal.minuteEstimatedTime === Infinity) {
    const bufferMs = bufferMinutes * 60_000;
    const chunkResult = await RUN_INFINITY_CHUNK_LOOP_FN(self, symbol, when, context, backtestResult, bufferMs, signal.id);
    if (chunkResult === null) {
      return { iNext: true, previousEventTimestamp };
    }
    backtestResult = chunkResult;
  }

  if (backtestResult.action === "active") {
    return { iNext: true, previousEventTimestamp };
  }

  self.loggerService.info("backtestLogicPrivateService scheduled signal closed", {
    symbol,
    signalId: backtestResult.signal.id,
    closeTimestamp: backtestResult.closeTimestamp,
    action: backtestResult.action,
    closeReason: backtestResult.action === "closed" ? backtestResult.closeReason : undefined,
  });

  const newTimestamp = await EMIT_SIGNAL_PERFORMANCE_FN(self, symbol, signalStartTime, previousEventTimestamp);

  const shouldStop = await CHECK_STOPPED_FN(self, symbol, "after scheduled signal closed", {
    symbol,
    signalId: backtestResult.signal.id,
    processedFrames: undefined,
    totalFrames: undefined,
  });

  return {
    previousEventTimestamp: newTimestamp,
    closeTimestamp: backtestResult.closeTimestamp,
    shouldStop,
    scheduledYield: scheduleOpenResult,
    backtestYield: backtestResult,
  };
};

const PROCESS_OPENED_SIGNAL_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  when: Date,
  result: IStrategyTickResultOpened,
  previousEventTimestamp: number | null
): Promise<IProcessSignalResult> => {
  const signalStartTime = performance.now();
  const signal = result.signal;

  self.loggerService.info("backtestLogicPrivateService signal opened", {
    symbol,
    signalId: signal.id,
    minuteEstimatedTime: signal.minuteEstimatedTime,
  });

  const bufferMinutes = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - ACTIVE_CANDLE_INCLUDED;
  const bufferStartTime = new Date(when.getTime() - bufferMinutes * 60 * 1000);
  const context = {
    strategyName: self.methodContextService.context.strategyName,
    exchangeName: self.methodContextService.context.exchangeName,
    frameName: self.methodContextService.context.frameName,
  };

  let backtestResult: IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive | undefined;

  if (signal.minuteEstimatedTime !== Infinity) {
    const totalCandles = signal.minuteEstimatedTime + GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;

    const candles = await GET_CANDLES_FN(self, symbol, totalCandles, bufferStartTime, { signalId: signal.id, totalCandles, bufferMinutes });
    if (candles === null) {
      return { iNext: true, previousEventTimestamp };
    }

    if (!candles.length) {
      return { iNext: true, previousEventTimestamp };
    }

    self.loggerService.info("backtestLogicPrivateService candles fetched", {
      symbol,
      signalId: signal.id,
      candlesCount: candles.length,
    });

    const firstResult = await BACKTEST_FN(self, symbol, candles, when, context, { signalId: signal.id });
    if (firstResult === null) {
      return { iNext: true, previousEventTimestamp };
    }
    backtestResult = firstResult;
  } else {
    const bufferMs = bufferMinutes * 60_000;
    const CHUNK = GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST;
    let chunkStart = bufferStartTime;
    let lastChunkCandles: ICandleData[] = [];

    chunkLoop: while (true) {
      const chunkCandles = await GET_CANDLES_FN(self, symbol, CHUNK, chunkStart, { signalId: signal.id, bufferMinutes });
      if (chunkCandles === null) {
        return { iNext: true, previousEventTimestamp };
      }

      if (!chunkCandles.length) {
        if (!lastChunkCandles.length) {
          return { iNext: true, previousEventTimestamp };
        }
        await self.strategyCoreService.closePending(true, symbol, context);
        const result = await BACKTEST_FN(self, symbol, lastChunkCandles, when, context, { signalId: signal.id });
        if (result === null) {
          return { iNext: true, previousEventTimestamp };
        }
        backtestResult = result.action !== "active" ? result : undefined;
        break chunkLoop;
      }

      self.loggerService.info("backtestLogicPrivateService candles fetched", {
        symbol,
        signalId: signal.id,
        candlesCount: chunkCandles.length,
      });

      const chunkResult = await BACKTEST_FN(self, symbol, chunkCandles, when, context, { signalId: signal.id });
      if (chunkResult === null) {
        return { iNext: true, previousEventTimestamp };
      }

      if (chunkResult.action !== "active") {
        backtestResult = chunkResult;
        break chunkLoop;
      }

      lastChunkCandles = chunkCandles;
      chunkStart = new Date(chunkResult._backtestLastTimestamp + 60_000 - bufferMs);
    }
  }

  if (backtestResult === undefined) {
    return { iNext: true, previousEventTimestamp };
  }

  if (backtestResult.action === "active") {
    throw new Error(
      `backtestLogicPrivateService: unexpected active result for signal ${signal.id} — infinite chunk loop logic error`
    );
  }

  self.loggerService.info("backtestLogicPrivateService signal closed", {
    symbol,
    signalId: backtestResult.signal.id,
    closeTimestamp: backtestResult.closeTimestamp,
  });

  const newTimestamp = await EMIT_SIGNAL_PERFORMANCE_FN(self, symbol, signalStartTime, previousEventTimestamp);

  const shouldStop = await CHECK_STOPPED_FN(self, symbol, "after signal closed", {
    symbol,
    signalId: backtestResult.signal.id,
    processedFrames: undefined,
    totalFrames: undefined,
  });

  return {
    previousEventTimestamp: newTimestamp,
    closeTimestamp: backtestResult.closeTimestamp,
    shouldStop,
    backtestYield: backtestResult,
  };
};

/**
 * Private service for backtest orchestration using async generators.
 *
 * Flow:
 * 1. Get timeframes from frame service
 * 2. Iterate through timeframes calling tick()
 * 3. When signal opens: fetch candles and call backtest()
 * 4. Skip timeframes until signal closes
 * 5. Yield closed result and continue
 *
 * Memory efficient: streams results without array accumulation.
 * Supports early termination via break in consumer.
 */
export class BacktestLogicPrivateService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly strategyCoreService = inject<StrategyCoreService>(
    TYPES.strategyCoreService
  );
  readonly exchangeCoreService = inject<ExchangeCoreService>(
    TYPES.exchangeCoreService
  );
  readonly frameCoreService = inject<FrameCoreService>(
    TYPES.frameCoreService
  );
  readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );
  readonly actionCoreService = inject<ActionCoreService>(
    TYPES.actionCoreService
  );

  /**
   * Runs backtest for a symbol, streaming closed signals as async generator.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @yields Closed signal results with PNL
   *
   * @example
   * ```typescript
   * for await (const result of backtestLogic.run("BTCUSDT")) {
   *   console.log(result.closeReason, result.pnl.pnlPercentage);
   *   if (result.pnl.pnlPercentage < -10) break; // Early termination
   * }
   * ```
   */
  public async *run(symbol: string) {
    this.loggerService.log("backtestLogicPrivateService run", {
      symbol,
    });

    const backtestStartTime = performance.now();

    const timeframes = await this.frameCoreService.getTimeframe(
      symbol,
      this.methodContextService.context.frameName
    );
    const totalFrames = timeframes.length;

    let i = 0;
    let previousEventTimestamp: number | null = null;

    while (i < timeframes.length) {
      const timeframeStartTime = performance.now();
      const when = timeframes[i];

      await EMIT_PROGRESS_FN(this, symbol, totalFrames, i);

      if (await CHECK_STOPPED_FN(this, symbol, "before tick", { when: when.toISOString(), processedFrames: i, totalFrames })) {
        break;
      }

      const result = await TICK_FN(this, symbol, when);
      if (result === null) {
        i++;
        continue;
      }

      if (
        result.action === "idle" &&
        await and(
          Promise.resolve(true),
          this.strategyCoreService.getStopped(true, symbol, {
            strategyName: this.methodContextService.context.strategyName,
            exchangeName: this.methodContextService.context.exchangeName,
            frameName: this.methodContextService.context.frameName,
          })
        )
      ) {
        this.loggerService.info("backtestLogicPrivateService stopped by user request (idle state)", {
          symbol,
          when: when.toISOString(),
          processedFrames: i,
          totalFrames,
        });
        break;
      }

      if (result.action === "scheduled") {
        yield result;

        const r = await PROCESS_SCHEDULED_SIGNAL_FN(this, symbol, when, result, previousEventTimestamp);
        previousEventTimestamp = r.previousEventTimestamp;

        if (r.iNext) {
          i++;
          continue;
        }

        if (r.scheduledYield) {
          yield r.scheduledYield;
        }
        if (r.backtestYield) {
          yield r.backtestYield;
        }

        if (r.closeTimestamp) {
          while (i < timeframes.length && timeframes[i].getTime() < r.closeTimestamp) {
            i++;
          }
        }

        if (r.shouldStop) {
          break;
        }
      }

      if (result.action === "opened") {
        yield result;

        const r = await PROCESS_OPENED_SIGNAL_FN(this, symbol, when, result, previousEventTimestamp);
        previousEventTimestamp = r.previousEventTimestamp;

        if (r.iNext) {
          i++;
          continue;
        }

        if (r.backtestYield) {
          yield r.backtestYield;
        }

        if (r.closeTimestamp) {
          while (i < timeframes.length && timeframes[i].getTime() < r.closeTimestamp) {
            i++;
          }
        }

        if (r.shouldStop) {
          break;
        }
      }

      previousEventTimestamp = await EMIT_TIMEFRAME_PERFORMANCE_FN(this, symbol, timeframeStartTime, previousEventTimestamp);

      i++;
    }

    // Emit final progress event (100%)
    await EMIT_PROGRESS_FN(this, symbol, totalFrames, totalFrames);

    // Track total backtest duration
    const backtestEndTime = performance.now();
    const currentTimestamp = Date.now();
    await performanceEmitter.next({
      timestamp: currentTimestamp,
      previousTimestamp: previousEventTimestamp,
      metricType: "backtest_total",
      duration: backtestEndTime - backtestStartTime,
      strategyName: this.methodContextService.context.strategyName,
      exchangeName: this.methodContextService.context.exchangeName,
      frameName: this.methodContextService.context.frameName,
      symbol,
      backtest: true,
    });
  }
}

export default BacktestLogicPrivateService;
