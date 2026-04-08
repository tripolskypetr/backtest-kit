import { inject } from "../../../core/di";
import { TLoggerService } from "../../base/LoggerService";
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

const SYMBOL_FN_ERROR = Symbol("backtest-fn-error");

/**
 * Returned by helper FNs when a sub-operation fails.
 *
 * @property type - Discriminant, always `"error"`.
 * @property reason - Name of the FN function that originated the error (e.g. `"TICK_FN"`).
 *   Preserved as-is when propagated through callers, so the root cause is always traceable.
 * @property message - Human-readable description: `getErrorMessage(error)` for caught exceptions,
 *   or a static descriptive string for logic-level failures (e.g. signal still active after closePending).
 */
type TFnError = { type: "error"; __error__: typeof SYMBOL_FN_ERROR, reason: string; message: string };

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
): Promise<IStrategyTickResult | TFnError> => {
  try {
    return await self.strategyCoreService.tick(symbol, when, true, {
      strategyName: self.methodContextService.context.strategyName,
      exchangeName: self.methodContextService.context.exchangeName,
      frameName: self.methodContextService.context.frameName,
    });
  } catch (error) {
    console.error(`backtestLogicPrivateService tick failed symbol=${symbol} when=${when.toISOString()} strategyName=${self.methodContextService.context.strategyName} exchangeName=${self.methodContextService.context.exchangeName} error=${getErrorMessage(error)}`, {
      error: errorData(error),
    });
    self.loggerService.warn("backtestLogicPrivateService tick failed", {
      symbol,
      when: when.toISOString(),
      error: errorData(error), message: getErrorMessage(error),
    });
    await errorEmitter.next(error);
    return { type: "error", __error__: SYMBOL_FN_ERROR, reason: "TICK_FN", message: getErrorMessage(error) };
  }
};

const GET_CANDLES_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  candlesNeeded: number,
  bufferStartTime: Date,
  logMeta: object
): Promise<ICandleData[] | TFnError> => {
  try {
    return await self.exchangeCoreService.getNextCandles(symbol, "1m", candlesNeeded, bufferStartTime, true);
  } catch (error) {
    console.error(`backtestLogicPrivateService getNextCandles failed symbol=${symbol} strategyName=${self.methodContextService.context.strategyName} exchangeName=${self.methodContextService.context.exchangeName}`);
    self.loggerService.warn("backtestLogicPrivateService getNextCandles failed", {
      symbol,
      candlesNeeded,
      error: errorData(error), message: getErrorMessage(error),
      ...logMeta,
    });
    await errorEmitter.next(error);
    return { type: "error", __error__: SYMBOL_FN_ERROR, reason: "GET_CANDLES_FN", message: getErrorMessage(error) };
  }
};

const BACKTEST_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  candles: ICandleData[],
  frameEndTime: number,
  when: Date,
  context: { strategyName: string; exchangeName: string; frameName: string },
  logMeta: object
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive | TFnError> => {
  try {
    return await self.strategyCoreService.backtest(symbol, candles, frameEndTime, when, true, context);
  } catch (error) {
    console.error(`backtestLogicPrivateService backtest failed symbol=${symbol} when=${when.toISOString()} strategyName=${context.strategyName} exchangeName=${context.exchangeName}`);
    self.loggerService.warn("backtestLogicPrivateService backtest failed", {
      symbol,
      error: errorData(error), message: getErrorMessage(error),
      ...logMeta,
    });
    await errorEmitter.next(error);
    return { type: "error", __error__: SYMBOL_FN_ERROR, reason: "BACKTEST_FN", message: getErrorMessage(error) };
  }
};

const CLOSE_PENDING_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  context: { strategyName: string; exchangeName: string; frameName: string },
  lastChunkCandles: ICandleData[],
  frameEndTime: number,
  when: Date,
  signalId: string
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | TFnError> => {
  try {
    await self.strategyCoreService.closePending(true, symbol, context);
  } catch (error) {
    const message = `closePending failed: ${getErrorMessage(error)}`;
    console.error(`backtestLogicPrivateService CLOSE_PENDING_FN: ${message} symbol=${symbol}`);
    await errorEmitter.next(error instanceof Error ? error : new Error(message));
    return { type: "error", __error__: SYMBOL_FN_ERROR, reason: "CLOSE_PENDING_FN", message };
  }
  const result = await BACKTEST_FN(self, symbol, lastChunkCandles, frameEndTime, when, context, { signalId });
  if ("__error__" in result) {
    return result;
  }
  if (result.action === "active") {
    const message = `signal ${signalId} still active after closePending`;
    console.error(`backtestLogicPrivateService CLOSE_PENDING_FN: ${message} symbol=${symbol}`);
    await errorEmitter.next(new Error(message));
    return { type: "error", __error__: SYMBOL_FN_ERROR, reason: "CLOSE_PENDING_FN", message };
  }
  return result;
};

const RUN_INFINITY_CHUNK_LOOP_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  when: Date,
  context: { strategyName: string; exchangeName: string; frameName: string },
  initialResult: IStrategyTickResultActive,
  bufferMs: number,
  signalId: string,
  frameEndTime: number
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | TFnError> => {
  let backtestResult: IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive = initialResult;
  const CHUNK = GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST;
  let lastChunkCandles: ICandleData[] = [];
  let chunkStart = new Date(initialResult._backtestLastTimestamp + 60_000 - bufferMs);

  while (backtestResult.action === "active") {
    const chunkCandles = await GET_CANDLES_FN(self, symbol, CHUNK, chunkStart, { signalId });
    if ("__error__" in chunkCandles) {
      return chunkCandles;
    }

    if (!chunkCandles.length) {
      return await CLOSE_PENDING_FN(self, symbol, context, lastChunkCandles, frameEndTime, when, signalId);
    }

    self.loggerService.info("backtestLogicPrivateService candles fetched for infinity chunk", {
      symbol,
      signalId,
      candlesCount: chunkCandles.length,
    });

    const chunkResult = await BACKTEST_FN(self, symbol, chunkCandles, frameEndTime, when, context, { signalId });
    if ("__error__" in chunkResult) {
      return chunkResult;
    }

    if (chunkResult.action !== "active") {
      return chunkResult;
    }

    lastChunkCandles = chunkCandles;
    backtestResult = chunkResult;
    chunkStart = new Date(chunkResult._backtestLastTimestamp + 60_000 - bufferMs);
  }

  return backtestResult as IStrategyTickResultClosed | IStrategyTickResultCancelled;
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

/**
 * Discriminated union returned by PROCESS_SCHEDULED_SIGNAL_FN and PROCESS_OPENED_SIGNAL_FN.
 *
 * - `"skip"` — signal did not resolve within the estimated timeframe (e.g. no candles available,
 *   backtest still active after allotted minutes). Backtest continues to the next timeframe.
 * - `"error"` — a sub-operation failed (getCandles, backtest, or chunk loop returned null).
 *   Backtest stops immediately.
 * - `"closed"` — signal resolved (closed or cancelled). Contains the updated performance
 *   timestamp, the close timestamp used to skip ahead in the timeframe loop, and a flag
 *   indicating whether the user has requested a stop.
 */
type TProcessSignalResult =
  | { type: "skip" }
  | TFnError
  | { type: "closed"; previousEventTimestamp: number; closeTimestamp: number; shouldStop: boolean };

const PROCESS_SCHEDULED_SIGNAL_FN = async function*(
  self: BacktestLogicPrivateService,
  symbol: string,
  when: Date,
  result: IStrategyTickResultScheduled,
  previousEventTimestamp: number | null,
  frameEndTime: number
): AsyncGenerator<
  IStrategyTickResultOpened | IStrategyTickResultClosed | IStrategyTickResultCancelled,
  TProcessSignalResult
> {
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
  if ("__error__" in candles) {
    console.error(`backtestLogicPrivateService scheduled signal: getCandles failed, stopping backtest symbol=${symbol} signalId=${signal.id} reason=${candles.reason} message=${candles.message}`);
    return candles;
  }

  // No candles available for this scheduled signal — the frame ends before the signal
  // could be evaluated. Unlike pending (Infinity) signals that require CLOSE_PENDING_FN,
  // a scheduled signal that never activated needs no explicit cancellation: it simply
  // did not start. Returning "skip" moves the backtest to the next timeframe.
  if (!candles.length) {
    return { type: "skip" };
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
    const firstResult = await BACKTEST_FN(self, symbol, candles, frameEndTime, when, context, { signalId: signal.id });
    if ("__error__" in firstResult) {
      console.error(`backtestLogicPrivateService scheduled signal: backtest failed, stopping backtest symbol=${symbol} signalId=${signal.id} reason=${firstResult.reason} message=${firstResult.message}`);
      return firstResult;
    }
    backtestResult = firstResult;
  } finally {
    unScheduleOpen && unScheduleOpen();
  }

  if (backtestResult.action === "active" && signal.minuteEstimatedTime === Infinity) {
    const bufferMs = bufferMinutes * 60_000;
    const chunkResult = await RUN_INFINITY_CHUNK_LOOP_FN(self, symbol, when, context, backtestResult, bufferMs, signal.id, frameEndTime);
    if ("__error__" in chunkResult) {
      console.error(`backtestLogicPrivateService scheduled signal: infinity chunk loop failed, stopping backtest symbol=${symbol} signalId=${signal.id} reason=${chunkResult.reason} message=${chunkResult.message}`);
      return chunkResult;
    }
    backtestResult = chunkResult;
  }

  if (backtestResult.action === "active") {
    return { type: "skip" };
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

  if (scheduleOpenResult!) {
    yield scheduleOpenResult;
  }
  yield backtestResult;

  return { type: "closed", previousEventTimestamp: newTimestamp, closeTimestamp: backtestResult.closeTimestamp, shouldStop };
};

const RUN_OPENED_CHUNK_LOOP_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  when: Date,
  context: { strategyName: string; exchangeName: string; frameName: string },
  bufferStartTime: Date,
  bufferMs: number,
  signalId: string,
  frameEndTime: number
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | TFnError> => {
  const CHUNK = GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST;
  let chunkStart = bufferStartTime;
  let lastChunkCandles: ICandleData[] = [];

  while (true) {
    const chunkCandles = await GET_CANDLES_FN(self, symbol, CHUNK, chunkStart, { signalId, bufferMs });
    if ("__error__" in chunkCandles) {
      return chunkCandles;
    }

    if (!chunkCandles.length) {
      if (!lastChunkCandles.length) {
        const message = `no candles fetched on first chunk for signal ${signalId}`;
        console.error(`backtestLogicPrivateService RUN_OPENED_CHUNK_LOOP_FN: ${message} symbol=${symbol}`);
        self.loggerService.warn("backtestLogicPrivateService opened infinity: no candles fetched on first chunk", {
          symbol,
          signalId,
          bufferStartTime,
        });
        await errorEmitter.next(new Error(message));
        return { type: "error", __error__: SYMBOL_FN_ERROR, reason: "RUN_OPENED_CHUNK_LOOP_FN", message };
      }
      return await CLOSE_PENDING_FN(self, symbol, context, lastChunkCandles, frameEndTime, when, signalId);
    }

    self.loggerService.info("backtestLogicPrivateService candles fetched", {
      symbol,
      signalId,
      candlesCount: chunkCandles.length,
    });

    const chunkResult = await BACKTEST_FN(self, symbol, chunkCandles, frameEndTime, when, context, { signalId });
    if ("__error__" in chunkResult) {
      return chunkResult;
    }

    if (chunkResult.action !== "active") {
      return chunkResult;
    }

    lastChunkCandles = chunkCandles;
    chunkStart = new Date(chunkResult._backtestLastTimestamp + 60_000 - bufferMs);
  }
};

const PROCESS_OPENED_SIGNAL_FN = async function*(
  self: BacktestLogicPrivateService,
  symbol: string,
  when: Date,
  result: IStrategyTickResultOpened,
  previousEventTimestamp: number | null,
  frameEndTime: number
): AsyncGenerator<
  IStrategyTickResultClosed | IStrategyTickResultCancelled,
  TProcessSignalResult
> {
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
    if ("__error__" in candles) {
      console.error(`backtestLogicPrivateService opened signal: getCandles failed, stopping backtest symbol=${symbol} signalId=${signal.id} reason=${candles.reason} message=${candles.message}`);
      return candles;
    }

    if (!candles.length) {
      return { type: "skip" };
    }

    self.loggerService.info("backtestLogicPrivateService candles fetched", {
      symbol,
      signalId: signal.id,
      candlesCount: candles.length,
    });

    const firstResult = await BACKTEST_FN(self, symbol, candles, frameEndTime, when, context, { signalId: signal.id });
    if ("__error__" in firstResult) {
      console.error(`backtestLogicPrivateService opened signal: backtest failed, stopping backtest symbol=${symbol} signalId=${signal.id} reason=${firstResult.reason} message=${firstResult.message}`);
      return firstResult;
    }
    backtestResult = firstResult;
  } else {
    const bufferMs = bufferMinutes * 60_000;
    const chunkResult = await RUN_OPENED_CHUNK_LOOP_FN(self, symbol, when, context, bufferStartTime, bufferMs, signal.id, frameEndTime);
    if ("__error__" in chunkResult) {
      console.error(`backtestLogicPrivateService opened signal: chunk loop failed, stopping backtest symbol=${symbol} signalId=${signal.id} reason=${chunkResult.reason} message=${chunkResult.message}`);
      return chunkResult;
    }
    backtestResult = chunkResult;
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

  yield backtestResult;

  return { type: "closed", previousEventTimestamp: newTimestamp, closeTimestamp: backtestResult.closeTimestamp, shouldStop };
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
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
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

    let _fatalError: unknown = null;
    let previousEventTimestamp: number | null = null;

    const timeframes = await this.frameCoreService.getTimeframe(
      symbol,
      this.methodContextService.context.frameName
    );
    const totalFrames = timeframes.length;
    
    let frameEndTime = timeframes[totalFrames - 1].getTime();

    let i = 0;

    try {
      while (i < timeframes.length) {
        const timeframeStartTime = performance.now();
        const when = timeframes[i];

        await EMIT_PROGRESS_FN(this, symbol, totalFrames, i);

        if (await CHECK_STOPPED_FN(this, symbol, "before tick", { when: when.toISOString(), processedFrames: i, totalFrames })) {
          break;
        }

        const result = await TICK_FN(this, symbol, when);
        if ("__error__" in result) {
          _fatalError = new Error(`[${result.reason}] ${result.message}`);
          break;
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

          const r = yield* PROCESS_SCHEDULED_SIGNAL_FN(this, symbol, when, result, previousEventTimestamp, frameEndTime);

          if (r.type === "error") {
            _fatalError = new Error(`[${r.reason}] ${r.message}`);
            break;
          }

          if (r.type === "closed") {
            previousEventTimestamp = r.previousEventTimestamp;
            while (i < timeframes.length && timeframes[i].getTime() < r.closeTimestamp) {
              i++;
            }
            if (r.shouldStop) {
              break;
            }
          }
        }

        if (result.action === "opened") {
          yield result;

          const r = yield* PROCESS_OPENED_SIGNAL_FN(this, symbol, when, result, previousEventTimestamp, frameEndTime);

          if (r.type === "error") {
            _fatalError = new Error(`[${r.reason}] ${r.message}`);
            break;
          }

          if (r.type === "closed") {
            previousEventTimestamp = r.previousEventTimestamp;
            while (i < timeframes.length && timeframes[i].getTime() < r.closeTimestamp) {
              i++;
            }
            if (r.shouldStop) {
              break;
            }
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
    } catch (error) {
      _fatalError = error;
    } finally {
      if (_fatalError !== null) {
        console.error(
          `[BacktestLogicPrivateService] Fatal error — backtest sequence broken for symbol=${symbol} ` +
          `strategy=${this.methodContextService.context.strategyName}`,
          _fatalError
        );
        process.exit(-1);
      }
    }
  }
}

export default BacktestLogicPrivateService;
