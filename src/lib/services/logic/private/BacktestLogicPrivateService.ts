import { inject } from "../../../core/di";
import { TLoggerService } from "../../base/LoggerService";
import TYPES from "../../../core/types";
import { IStrategyTickResult, IStrategyTickResultOpened, IStrategyTickResultScheduled, IStrategyTickResultClosed, IStrategyTickResultCancelled, IStrategyTickResultActive } from "../../../../interfaces/Strategy.interface";
import { ICandleData } from "../../../../interfaces/Exchange.interface";
import StrategyCoreService from "../../core/StrategyCoreService";
import ExchangeCoreService from "../../core/ExchangeCoreService";
import FrameCoreService from "../../core/FrameCoreService";
import FrameSchemaService from "../../schema/FrameSchemaService";
import { intervalStepMs } from "../../../../utils/intervalStepMs";
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
import { and, errorData, getErrorMessage, sleep } from "functools-kit";
import ActionCoreService from "../../core/ActionCoreService";
import { Candle } from "../../../../classes/Candle";
import { Lockstep } from "../../../../classes/Lockstep";
import { Lookup } from "../../../../classes/Lookup";
import TimeMetaService from "../../meta/TimeMetaService";
import PriceMetaService from "../../meta/PriceMetaService";

const ACTIVE_CANDLE_INCLUDED = 1;
const SCHEDULE_ACTIVATION_CANDLE_SKIP = 1;

const KILL_SYMBOL = Symbol.for("backtest-kit-kill");

const LOCKSTEP_SOURCE = "BacktestLogicPrivateService run";
const LOCKSTEP_HANDOFF_SOURCE = "BacktestLogicPrivateService handoff";

/** Memo key of a running backtest's lockstep cursor */
const CREATE_LOCKSTEP_KEY_FN = (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string }) =>
  `${symbol}:${context.strategyName}:${context.exchangeName}:${context.frameName}`;

/**
 * Where a running backtest stands with respect to the lockstep lock: whether
 * its current iteration holds it, the next timeframe boundary of that
 * iteration, the timeframe step, the logical time it is executing (`clock`:
 * the timeframe of the iteration it is running, or the boundary a replay has
 * resumed on) and, while it waits for its peers, where and why it is parked:
 * `start` before running the iteration at `at` (its tick at `at` has NOT
 * happened yet), `handoff` on the last candle before the boundary `at`
 * (everything before `at` HAS happened). Updated by `run()`, read by the
 * waits of every running backtest.
 */
type TLockstepCursor = {
  locked: boolean;
  nextBoundary: number;
  stepMs: number;
  clock: number;
  parked: { at: number; kind: "start" | "handoff" } | null;
  /** Still inside the join wait (sleeping on a timer, not on the lock): peers wait for it by the same timer */
  joining: boolean;
};

/** Lockstep cursor of every backtest currently inside `run()`, by symbol and context (process-wide, like the lock itself) */
const LOCKSTEP_CURSORS = new Map<string, TLockstepCursor>();

/** One macrotask between join rounds, the same beat as `Candle.spinLock` */
const LOCKSTEP_JOIN_DELAY = 50;
/** Join rounds before a backtest stops waiting for launched peers that still have no cursor */
const LOCKSTEP_JOIN_ROUNDS = 20;

/**
 * Lets the peers launched in the same synchronous loop (`Launcher`, several
 * `Backtest.background` in a row) register before the first iteration runs.
 *
 * `Lookup.addActivity` is synchronous in `Backtest.background`, but the
 * lockstep cursor appears only after the first awaits of the run (the
 * before-start price fetch, the timeframes), so a symbol whose candles come
 * back first would see an empty registry and run ahead alone, and its peers
 * would then join from the past. The first iteration therefore starts after a
 * macrotask, and the wait repeats every LOCKSTEP_JOIN_DELAY while a launched
 * backtest activity has no cursor yet: the peers are blocked on I/O, which a
 * lock spin on microtasks would never let through. Bounded by
 * LOCKSTEP_JOIN_ROUNDS: a peer that never registers (a start that died before
 * `run`) is logged and no longer waited for.
 */
const JOIN_PEERS_FN = async (self: BacktestLogicPrivateService, symbol: string): Promise<void> => {
  const pending = () =>
    Lookup.listActivity()
      .filter((activity) => activity.backtest)
      .filter((activity) => !LOCKSTEP_CURSORS.has(CREATE_LOCKSTEP_KEY_FN(activity.symbol, { ...activity.context, frameName: activity.context.frameName ?? "" })));
  for (let round = 0; round < LOCKSTEP_JOIN_ROUNDS; round++) {
    await sleep(LOCKSTEP_JOIN_DELAY);
    if (pending().length === 0) {
      return;
    }
  }
  const stuck = pending();
  const message = "backtestLogicPrivateService lockstep join: launched peers still have no cursor, starting without them";
  const payload = { symbol, waitedMs: LOCKSTEP_JOIN_DELAY * LOCKSTEP_JOIN_ROUNDS, peers: stuck.map((activity) => activity.symbol) };
  self.loggerService.warn(message, payload);
  console.warn(message, payload);
};

/** The finest timeframe step among the running backtests: the grid the hand-off inside a replay follows */
const LOCKSTEP_STEP_FN = (): number =>
  Array.from(LOCKSTEP_CURSORS.values()).reduce((min, cursor) => Math.min(min, cursor.stepMs), Infinity);

/**
 * The minute an idle strategy must be ticked on for a queued open command (createSignal,
 * setPendingSignal, stamped with the time meta's minute at the call): the minute after the
 * command, never before the last tick, and only when it comes before the next entry step `at` —
 * otherwise null and the entry step takes the command. The live loop takes such a command on
 * its next tick; without this the backtest would wait for the entry grid (a day on a daily entry).
 */
const QUEUED_OPEN_WAKE_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  lastWhen: number,
  at: number,
): Promise<number | null> => {
  const queuedAt = await self.strategyCoreService.getQueuedOpenAt(true, symbol, {
    strategyName: self.methodContextService.context.strategyName,
    exchangeName: self.methodContextService.context.exchangeName,
    frameName: self.methodContextService.context.frameName,
  });
  if (queuedAt === null) {
    return null;
  }
  const minute = Math.floor(queuedAt / 60_000) * 60_000 + 60_000;
  // under the lockstep the wake never steps behind the peers: a command stamped with a minute
  // the peers have passed (issued outside any execution context, with the strategy's own last
  // known minute) is taken at the frontier of the running backtests
  const frontier = GLOBAL_CONFIG.CC_BACKTEST_LOCKSTEP
    ? Array.from(LOCKSTEP_CURSORS.values()).reduce((max, cursor) => Math.max(max, cursor.clock), -Infinity)
    : -Infinity;
  const wake = Math.max(minute, lastWhen + 60_000, frontier);
  return wake < at ? wake : null;
};

/**
 * Parks the caller at `at` and spins the lockstep lock until every other
 * running backtest has caught up. A peer has caught up when it is executing
 * at or past `at` (`clock >= at`) or when it is parked somewhere it has
 * nothing left to do before `at`:
 * - for a `start` wait (an iteration about to run its tick at `at`) a peer
 *   parked past `at` counts, and so does one parked in its hand-off on `at`
 *   (this tick must land before that replay writes at `at`); two ticks on the
 *   same timeframe are a tie broken by the lockstep key — the symbol first, as
 *   the journal orders the rows of one minute: the smaller key goes first, the
 *   larger one waits until the smaller has left the barrier (its clock is then
 *   on `at`), so the arrival order of the rows is the same on every run;
 * - for a `handoff` wait (a replay about to run the candle on the boundary
 *   `at`) a peer parked at the START of `at` does NOT count: its tick at `at`
 *   must land before this replay writes at `at` and beyond. A peer parked in
 *   its own hand-off past `at` does count: everything before `at` is behind
 *   it; two replays on the same boundary are a tie broken by the key as well.
 * One spin gives every peer one iteration and a peer may lag several
 * iterations behind, so the spin repeats; it stops early when a round moved
 * no lagging peer (a peer blocked outside the orchestrator), rather than
 * spinning forever. A lagging peer that is still joining (sleeping on the
 * join timer, see JOIN_PEERS_FN) is not blocked, it only holds no lock: such a
 * round sleeps one join beat instead of giving up, bounded like the join
 * itself. Giving up is logged (loggerService.warn + console.warn) with the
 * lagging peers: in a healthy run it never happens — every await of an
 * iteration, the yields included, sits under the lock — so a hit means a peer
 * is dying (its cursor goes away once its error handling is done) or has been
 * left outside the lock by a code change, and the clocks will drift by what
 * this caller writes before that peer returns. `spinFirst` forces one spin
 * even when nobody lags: inside a replay that FIFO turn is what keeps the
 * peers interleaved.
 */
const WAIT_FOR_PEERS_FN = async (
  self: BacktestLogicPrivateService,
  cursor: TLockstepCursor,
  at: number,
  kind: "start" | "handoff",
  spinFirst: boolean,
  wake?: () => Promise<number | null>,
): Promise<number | null> => {
  cursor.parked = { at, kind };
  const keyOf = (target: TLockstepCursor) => Array.from(LOCKSTEP_CURSORS.entries()).find(([, peer]) => peer === target)?.[0] ?? "";
  const key = keyOf(cursor);
  // a tie on `at` of the same kind: the smaller lockstep key goes first
  const winsTie = (peer: TLockstepCursor): boolean => keyOf(peer) > key;
  const caughtUp = (peer: TLockstepCursor): boolean => {
    if (peer.clock >= at) {
      return true;
    }
    if (!peer.parked) {
      return false;
    }
    if (peer.parked.at > at) {
      return true;
    }
    if (peer.parked.at < at) {
      return false;
    }
    if (kind === "start") {
      return peer.parked.kind === "handoff" || winsTie(peer);
    }
    return peer.parked.kind === "handoff" && winsTie(peer);
  };
  const lagging = () => Array.from(LOCKSTEP_CURSORS.values()).filter((peer) => peer !== cursor && !caughtUp(peer));
  const describe = (peer: TLockstepCursor) => `${peer.clock}/${peer.parked ? `${peer.parked.kind}@${peer.parked.at}` : "-"}/${peer.joining}`;
  const snapshot = () => lagging().map(describe).join(",");
  let before = snapshot();
  let spin = spinFirst;
  let joinRounds = 0;
  while (spin || lagging().length > 0) {
    spin = false;
    await Lockstep.spinLock(LOCKSTEP_HANDOFF_SOURCE);
    // a peer queued an open command for this strategy while it waited for its entry step:
    // leave the barrier, the caller ticks on the minute after the command instead
    if (wake) {
      const wakeAt = await wake();
      if (wakeAt !== null) {
        cursor.parked = null;
        return wakeAt;
      }
    }
    const after = snapshot();
    if (lagging().length > 0 && after === before) {
      if (lagging().some((peer) => peer.joining) && joinRounds++ < LOCKSTEP_JOIN_ROUNDS) {
        await sleep(LOCKSTEP_JOIN_DELAY);
        continue;
      }
      {
        const message = "backtestLogicPrivateService lockstep gave up waiting for peers that make no progress";
        const payload = {
          backtest: keyOf(cursor),
          kind,
          at: new Date(at).toISOString(),
          lagging: lagging().map((peer) => ({
            backtest: keyOf(peer),
            clock: new Date(peer.clock).toISOString(),
            parked: peer.parked ? `${peer.parked.kind}@${new Date(peer.parked.at).toISOString()}` : null,
            joining: peer.joining,
          })),
        };
        self.loggerService.warn(message, payload);
        console.warn(message, payload);
      }
      break;
    }
    before = after;
  }
  cursor.parked = null;
  cursor.clock = at;
  return null;
};

/**
 * Lock hand-off inside a candle replay (CC_BACKTEST_LOCKSTEP).
 *
 * BACKTEST_FN replays a whole array of candles under the lockstep lock, so the
 * symbol's clock would jump by the position lifetime while its peers wait on
 * one timeframe; anything the strategy writes from the middle of the replay (a
 * DCA entry, a budget reserve) would then be checked against a journal the
 * peers have not reached yet. ClientStrategy pings on every replayed candle and
 * `StrategyConnectionService` calls `handoff` from its `onSchedulePing` /
 * `onActivePing` system callbacks BEFORE the candle's listeners run, and from
 * `onHandoff` right before the loops execute an exchange-forced event (a stop,
 * a take-profit, an activation) on a candle inside a watch span, which never
 * reaches the span-end ping: on the
 * first candle on or past the next boundary the replay waits
 * ({@link WAIT_FOR_PEERS_FN}) until every running peer has reached the last
 * boundary that candle crossed, so a write on that candle is checked against
 * everything the peers wrote before it. Candles are not necessarily one
 * minute apart: with the frame's `watchInterval` a replay evaluates one candle
 * per span (a daily watch on an hourly frame crosses 24 boundaries at
 * once), which is why the boundary is derived from the candle instead of
 * expecting the candle right before it. The boundaries follow the finest
 * timeframe step among the running backtests, not this symbol's own: a peer
 * on a 15m frame gets its 01:15 / 01:30 / 01:45 iterations in before this 1h
 * replay writes at 01:46. The same wait runs at the start of every iteration
 * (see `run`), so the replay never starts ahead of a peer either.
 *
 * No-op when lockstep is off, when the symbol is not inside `run()` (a tick
 * driven directly, outside the orchestrator) or when its iteration does not
 * hold the lock.
 */
const HANDOFF_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  timestamp: number,
  context: { strategyName: string; exchangeName: string; frameName: string },
): Promise<void> => {
  if (!GLOBAL_CONFIG.CC_BACKTEST_LOCKSTEP) {
    return;
  }
  const cursor = LOCKSTEP_CURSORS.get(CREATE_LOCKSTEP_KEY_FN(symbol, context));
  if (!cursor || !cursor.locked) {
    return;
  }
  // a candle before the next boundary: nothing of the peers is missing yet
  if (timestamp < cursor.nextBoundary) {
    return;
  }
  // the last boundary this candle crossed (a strided replay may cross many at once)
  const step = LOCKSTEP_STEP_FN();
  let boundary = cursor.nextBoundary;
  while (boundary + step <= timestamp) {
    boundary += step;
  }
  cursor.nextBoundary = boundary + step;
  self.loggerService.debug("backtestLogicPrivateService lockstep handoff", {
    symbol,
    timestamp,
    boundary,
  });
  await WAIT_FOR_PEERS_FN(self, cursor, boundary, "handoff", true);
};

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

/**
 * Reports a listener failure on an orchestrator-side emitter (progress,
 * performance). These emits run inside the timeframe loop; a listener that
 * throws must not turn into a fatal error of the whole backtest, so the
 * failure is logged and handed to the error channel, like the fallbacks of
 * the connection services do.
 */
const EMIT_FAILED_FN = (self: BacktestLogicPrivateService, emitter: string, symbol: string, error: unknown): void => {
  const message = `backtestLogicPrivateService ${emitter} listener thrown`;
  const payload = {
    symbol,
    error: errorData(error),
    message: getErrorMessage(error),
  };
  self.loggerService.warn(message, payload);
  console.warn(message, payload);
  errorEmitter.next(error instanceof Error ? error : new Error(getErrorMessage(error)));
};

const EMIT_PROGRESS_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  totalFrames: number,
  processedFrames: number,
  when: Date
): Promise<void> => {
  try {
    await progressBacktestEmitter.next({
      exchangeName: self.methodContextService.context.exchangeName,
      strategyName: self.methodContextService.context.strategyName,
      symbol,
      totalFrames,
      processedFrames,
      progress: totalFrames > 0 ? processedFrames / totalFrames : 0,
      backtest: true,
      when,
    });
  } catch (error) {
    EMIT_FAILED_FN(self, "progressBacktestEmitter", symbol, error);
  }
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

/**
 * Wraps `exchangeCoreService.getNextCandles` with error capture and a cooperative
 * event-loop hand-off after a successful fetch.
 *
 * Calls `Candle.spinLock(...)` on success: when multiple backtests run in parallel
 * (`Lookup.isParallel === true`), this yields the event loop so a peer waiting on
 * the candle-fetch mutex can take its turn, producing round-robin interleaving
 * instead of one backtest monopolizing the loop until completion. The spin is a
 * no-op for single-workload runs.
 *
 * @param self - Owning service instance, used for logging and exchange access.
 * @param symbol - Trading pair symbol.
 * @param candlesNeeded - Number of 1m candles to request.
 * @param bufferStartTime - Inclusive start time for the fetch window.
 * @param logMeta - Extra structured fields appended to the warn log on failure.
 * @returns Fetched candles, or a {@link TFnError} discriminated union on failure.
 */
const GET_CANDLES_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  candlesNeeded: number,
  bufferStartTime: Date,
  logMeta: object
): Promise<ICandleData[] | TFnError> => {
  try {
    const result = await self.exchangeCoreService.getNextCandles(symbol, "1m", candlesNeeded, bufferStartTime, true);
    await Candle.spinLock("BacktestLogicPrivateService GET_CANDLES_FN");
    return result;
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

/**
 * Number of 1m candles a position may still consume inside the frame: from
 * `since` up to frameEndTime plus ONE candle past it. The candle after the
 * frame end is what PROCESS_PENDING_SIGNAL_CANDLES_FN needs to close by
 * time_expired (its check is `timestamp > frameEndTime`); nothing beyond it is
 * ever requested, so a feed that stops at the frame end, a dead feed or a frame
 * ending today cannot turn into a multi-day gap fill, an "Insufficient candle
 * data" throw or an empty fetch that leaves the position open.
 */
const CANDLES_UNTIL_FRAME_END_FN = (since: Date, frameEndTime: number): number =>
  Math.max(0, Math.floor((frameEndTime - since.getTime()) / 60_000) + 2);

/**
 * Size (in 1m candles) of one replay window of a position (every hold): the
 * VWAP buffer plus the candles ClientStrategy.backtest evaluates before the
 * orchestrator fetches the next window.
 *
 * With a per-candle watch ("1m") it is CC_MAX_CANDLES_PER_REQUEST. With a
 * coarser `watchInterval` of the frame the window holds a WHOLE number of
 * spans: the largest multiple of the step that fits CC_MAX_CANDLES_PER_REQUEST,
 * or one span when the step is longer. The strided loop restarts its count in
 * every array it is given, so a window that is not a multiple of the step
 * would end on a partial span and the evaluation grid would follow "step,
 * step, remainder" instead of the step (a daily watch on 1000-candle windows
 * evaluated every 996 minutes). The exchange layer pages a window longer than
 * CC_MAX_CANDLES_PER_REQUEST, that limit stays the exchange's request size;
 * the window is what the replay sees.
 */
const CHUNK_CANDLES_FN = (
  self: BacktestLogicPrivateService,
  bufferMinutes: number,
  firstEvaluableMs: number,
  anchorMs: number
): number => {
  const maxCandles = GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST;
  const stepMs = intervalStepMs(self.frameSchemaService.getWatchInterval(self.methodContextService.context.frameName));
  const step = stepMs / 60_000;
  if (step <= 1) {
    return maxCandles;
  }
  const spans = Math.max(1, Math.floor((maxCandles - bufferMinutes) / step));
  // The watch grid of ClientStrategy.backtest is anchored at the signal (pendingAt), not at the
  // window: a window that starts off the grid (the candle after a scheduled activation) would end
  // on a boundary and leave one lone candle to a span of its own. Trim the window by the phase of
  // its first evaluable candle so it ends on the candle before a boundary.
  const phaseMinutes = (((firstEvaluableMs - anchorMs) % stepMs) + stepMs) % stepMs / 60_000;
  const usable = spans * step - phaseMinutes;
  return bufferMinutes + (usable > 0 ? usable : spans * step);
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
  frameEndTime: number,
  initialCandles: ICandleData[]
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | TFnError> => {
  let backtestResult: IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive = initialResult;
  const anchor = initialResult.signal.pendingAt;
  // Seed with the candles already replayed by the caller so CLOSE_PENDING_FN
  // never receives an empty array when the very first chunk fetch comes back
  // empty (frame ending near the present moment).
  let lastChunkCandles: ICandleData[] = initialCandles;
  let chunkStart = new Date(initialResult._backtestLastTimestamp + 60_000 - bufferMs);

  while (backtestResult.action === "active") {
    const window = CHUNK_CANDLES_FN(self, bufferMs / 60_000, chunkStart.getTime() + bufferMs, anchor);
    const chunkLimit = Math.min(window, CANDLES_UNTIL_FRAME_END_FN(chunkStart, frameEndTime));
    const chunkCandles = chunkLimit > 0
      ? await GET_CANDLES_FN(self, symbol, chunkLimit, chunkStart, { signalId, chunkLimit })
      : [];
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

    {
      await self.priceMetaService.next(symbol, chunkResult.currentPrice, context, true);
      await self.timeMetaService.next(symbol, chunkResult._backtestLastTimestamp, context, true);
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
  previousEventTimestamp: number | null,
  when: Date
): Promise<number> => {
  const signalEndTime = performance.now();
  const currentTimestamp = Date.now();
  try {
    await performanceEmitter.next({
      timestamp: currentTimestamp,
      previousTimestamp: previousEventTimestamp,
      when,
      metricType: "backtest_signal",
      duration: signalEndTime - signalStartTime,
      strategyName: self.methodContextService.context.strategyName,
      exchangeName: self.methodContextService.context.exchangeName,
      frameName: self.methodContextService.context.frameName,
      symbol,
      backtest: true,
    });
  } catch (error) {
    EMIT_FAILED_FN(self, "performanceEmitter", symbol, error);
  }
  return currentTimestamp;
};

const EMIT_TIMEFRAME_PERFORMANCE_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  timeframeStartTime: number,
  previousEventTimestamp: number | null,
  when: Date
): Promise<number> => {
  const timeframeEndTime = performance.now();
  const currentTimestamp = Date.now();
  try {
    await performanceEmitter.next({
      timestamp: currentTimestamp,
      previousTimestamp: previousEventTimestamp,
      when,
      metricType: "backtest_timeframe",
      duration: timeframeEndTime - timeframeStartTime,
      strategyName: self.methodContextService.context.strategyName,
      exchangeName: self.methodContextService.context.exchangeName,
      frameName: self.methodContextService.context.frameName,
      symbol,
      backtest: true,
    });
  } catch (error) {
    EMIT_FAILED_FN(self, "performanceEmitter", symbol, error);
  }
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

/**
 * Subscribes to the "opened" tick a scheduled activation emits from inside a replay
 * (CALL_BACKTEST_SCHEDULE_OPEN_FN in ClientStrategy): the tick is forwarded to the signal
 * emitters and the actions as a tick() result is, and kept for the caller to yield.
 */
const SUBSCRIBE_SCHEDULE_OPEN_FN = (
  self: BacktestLogicPrivateService,
  symbol: string,
  context: { strategyName: string; exchangeName: string; frameName: string },
): { unsubscribe: Function; opened: () => IStrategyTickResultOpened | null } => {
  const { strategyName, exchangeName, frameName } = context;
  let opened: IStrategyTickResultOpened | null = null;
  const unsubscribe = backtestScheduleOpenSubject.filter((event) => {
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
    opened = tick;
    await signalEmitter.next(tick);
    await signalBacktestEmitter.next(tick);
    await self.actionCoreService.signalBacktest(true, tick, {
      strategyName,
      exchangeName,
      frameName,
    });
  });
  return { unsubscribe, opened: () => opened };
};

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
  // The scheduled array covers the wait phase plus one replay window: after the activation
  // the position is handed back at the activation candle for every hold and continues in
  // bounded windows of whole watch spans (the whole hold is never fetched at once).
  const pendingPhaseMinutes = CHUNK_CANDLES_FN(self, bufferMinutes, bufferStartTime.getTime() + bufferMinutes * 60_000, bufferStartTime.getTime() + bufferMinutes * 60_000) - bufferMinutes;
  const candlesNeeded = Math.min(
    bufferMinutes + GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES + pendingPhaseMinutes + SCHEDULE_ACTIVATION_CANDLE_SKIP,
    CANDLES_UNTIL_FRAME_END_FN(bufferStartTime, frameEndTime),
  );

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

  const context = {
    strategyName: self.methodContextService.context.strategyName,
    exchangeName: self.methodContextService.context.exchangeName,
    frameName: self.methodContextService.context.frameName,
  };
  const scheduleOpen = SUBSCRIBE_SCHEDULE_OPEN_FN(self, symbol, context);

  try {
    const firstResult = await BACKTEST_FN(self, symbol, candles, frameEndTime, when, context, { signalId: signal.id });
    if ("__error__" in firstResult) {
      console.error(`backtestLogicPrivateService scheduled signal: backtest failed, stopping backtest symbol=${symbol} signalId=${signal.id} reason=${firstResult.reason} message=${firstResult.message}`);
      return firstResult;
    }
    backtestResult = firstResult;
  } finally {
    scheduleOpen.unsubscribe();
  }

  // Infinity hold: the leftover after the activation is replayed in whole watch spans.
  // Finite hold: the array covers the hold, so "active" means a close refused by the
  // broker gate on the last candle — the retry belongs to the next candle (next window).
  if (backtestResult.action === "active") {
    const bufferMs = bufferMinutes * 60_000;
    const chunkResult = await RUN_INFINITY_CHUNK_LOOP_FN(self, symbol, when, context, backtestResult, bufferMs, signal.id, frameEndTime, candles);
    if ("__error__" in chunkResult) {
      console.error(`backtestLogicPrivateService scheduled signal: infinity chunk loop failed, stopping backtest symbol=${symbol} signalId=${signal.id} reason=${chunkResult.reason} message=${chunkResult.message}`);
      return chunkResult;
    }
    backtestResult = chunkResult;
  }

  self.loggerService.info("backtestLogicPrivateService scheduled signal closed", {
    symbol,
    signalId: backtestResult.signal.id,
    closeTimestamp: backtestResult.closeTimestamp,
    action: backtestResult.action,
    closeReason: backtestResult.action === "closed" ? backtestResult.closeReason : undefined,
  });

  const newTimestamp = await EMIT_SIGNAL_PERFORMANCE_FN(self, symbol, signalStartTime, previousEventTimestamp, new Date(backtestResult.closeTimestamp));

  const shouldStop = await CHECK_STOPPED_FN(self, symbol, "after scheduled signal closed", {
    symbol,
    signalId: backtestResult.signal.id,
    processedFrames: undefined,
    totalFrames: undefined,
  });

  const scheduleOpenResult = scheduleOpen.opened();
  if (scheduleOpenResult) {
    yield scheduleOpenResult;
  }
  yield backtestResult;

  return { type: "closed", previousEventTimestamp: newTimestamp, closeTimestamp: backtestResult.closeTimestamp, shouldStop };
};

/**
 * Runs the chunked candle replay for an opened signal — every hold, finite or Infinity:
 * windows of whole watch spans (CHUNK_CANDLES_FN) until the replay returns a close.
 *
 * @returns The resolved (closed/cancelled) result, a {@link TFnError} on sub-operation
 *   failure, or `null` when no candles are available at all for the first chunk —
 *   the fetch window extends past the present moment (frame ending near "now"),
 *   so the signal cannot be evaluated yet. The caller treats `null` as "skip",
 *   mirroring the finite-signal path where an empty fetch also yields "skip".
 */
const RUN_OPENED_CHUNK_LOOP_FN = async (
  self: BacktestLogicPrivateService,
  symbol: string,
  when: Date,
  context: { strategyName: string; exchangeName: string; frameName: string },
  bufferStartTime: Date,
  bufferMs: number,
  signalId: string,
  frameEndTime: number
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | TFnError | null> => {
  const anchor = when.getTime();
  let chunkStart = bufferStartTime;
  let lastChunkCandles: ICandleData[] = [];

  while (true) {
    const window = CHUNK_CANDLES_FN(self, bufferMs / 60_000, chunkStart.getTime() + bufferMs, anchor);
    const chunkLimit = Math.min(window, CANDLES_UNTIL_FRAME_END_FN(chunkStart, frameEndTime));
    const chunkCandles = chunkLimit > 0
      ? await GET_CANDLES_FN(self, symbol, chunkLimit, chunkStart, { signalId, bufferMs, chunkLimit })
      : [];
    if ("__error__" in chunkCandles) {
      return chunkCandles;
    }

    if (!chunkCandles.length) {
      if (!lastChunkCandles.length) {
        self.loggerService.info("backtestLogicPrivateService opened infinity: no candles available for first chunk, skipping", {
          symbol,
          signalId,
          bufferStartTime,
        });
        return null;
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

    {
      await self.priceMetaService.next(symbol, chunkResult.currentPrice, context, true);
      await self.timeMetaService.next(symbol, chunkResult._backtestLastTimestamp, context, true);
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

  // Every hold — finite or Infinity — is replayed in bounded windows of whole watch
  // spans: the whole hold is never fetched at once (a year of 1m candles would be half a
  // million objects per symbol, times the parallel symbols that all open on the same
  // tick). The replay hands the position back at every window end and the loop below
  // continues it until the close; a finite hold finds its expiry on the exact candle of a
  // later window.
  {
    const bufferMs = bufferMinutes * 60_000;
    const chunkResult = await RUN_OPENED_CHUNK_LOOP_FN(self, symbol, when, context, bufferStartTime, bufferMs, signal.id, frameEndTime);
    if (chunkResult === null) {
      return { type: "skip" };
    }
    if ("__error__" in chunkResult) {
      console.error(`backtestLogicPrivateService opened signal: chunk loop failed, stopping backtest symbol=${symbol} signalId=${signal.id} reason=${chunkResult.reason} message=${chunkResult.message}`);
      return chunkResult;
    }
    backtestResult = chunkResult;
  }

  self.loggerService.info("backtestLogicPrivateService signal closed", {
    symbol,
    signalId: backtestResult.signal.id,
    closeTimestamp: backtestResult.closeTimestamp,
  });

  const newTimestamp = await EMIT_SIGNAL_PERFORMANCE_FN(self, symbol, signalStartTime, previousEventTimestamp, new Date(backtestResult.closeTimestamp));

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
 *
 * With `CC_BACKTEST_LOCKSTEP` every timeframe iteration runs under the
 * process-wide `Lockstep` mutex, so parallel backtests advance one
 * timeframe at a time instead of drifting apart in logical time.
 */
export class BacktestLogicPrivateService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  readonly strategyCoreService = inject<StrategyCoreService>(
    TYPES.strategyCoreService
  );
  readonly exchangeCoreService = inject<ExchangeCoreService>(
    TYPES.exchangeCoreService
  );
  readonly frameSchemaService = inject<FrameSchemaService>(TYPES.frameSchemaService);
  readonly frameCoreService = inject<FrameCoreService>(
    TYPES.frameCoreService
  );
  readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );
  readonly actionCoreService = inject<ActionCoreService>(
    TYPES.actionCoreService
  );
  readonly timeMetaService = inject<TimeMetaService>(
    TYPES.timeMetaService
  );
  readonly priceMetaService = inject<PriceMetaService>(
    TYPES.priceMetaService
  );

  /**
   * Lock hand-off inside a candle replay (CC_BACKTEST_LOCKSTEP), called by
   * `StrategyConnectionService` from its `onSchedulePing` / `onActivePing`
   * system callbacks on every replayed candle. See {@link HANDOFF_FN}.
   *
   * @param symbol - Trading pair symbol of the pinging backtest
   * @param timestamp - Timestamp of the replayed candle that pinged
   * @param context - Strategy, exchange and frame of the backtest
   */
  public handoff = async (
    symbol: string,
    timestamp: number,
    context: { strategyName: string; exchangeName: string; frameName: string },
  ): Promise<void> => {
    await HANDOFF_FN(this, symbol, timestamp, context);
  };

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
    // Action of the last tick / signal processing: anything but idle / closed /
    // cancelled at the end of the loop means a signal is still open.
    let lastAction: IStrategyTickResult["action"] | null = null;

    const timeframes = await this.frameCoreService.getTimeframe(
      symbol,
      this.methodContextService.context.frameName
    );
    const totalFrames = timeframes.length;
    
    let frameEndTime = timeframes[totalFrames - 1].getTime();

    // Lockstep cursor of this run: the ping hand-off (see handoff) reads it while a replay runs
    const stepMs = totalFrames > 1 ? timeframes[1].getTime() - timeframes[0].getTime() : 60_000;
    const lockstepKey = CREATE_LOCKSTEP_KEY_FN(symbol, this.methodContextService.context);
    const cursor: TLockstepCursor = { locked: false, nextBoundary: 0, stepMs, clock: timeframes[0].getTime(), parked: null, joining: true };
    LOCKSTEP_CURSORS.set(lockstepKey, cursor);
    if (GLOBAL_CONFIG.CC_BACKTEST_LOCKSTEP) {
      await JOIN_PEERS_FN(this, symbol);
    }
    cursor.joining = false;

    let i = 0;
    // The minute of a close or a cancel that fell off the entry grid: the live loop re-ticks
    // that minute without waiting for the next candle (the idle ping, a queued user signal or
    // adoption, getSignal under the interval throttle), so the backtest ticks it too before
    // resuming the grid. A close on a grid step is ticked by that step itself.
    let retickAt: number | null = null;
    // the `when` of the last iteration: a wake-up for a queued open command never ticks before it
    let lastWhen = -Infinity;

    try {
      while (i < timeframes.length) {
        // One timeframe per turn across parallel backtests (CC_BACKTEST_LOCKSTEP):
        // the lock spans the tick and the candle replay of a signal opened on it,
        // and is released in the finally before the next timeframe. Inside the
        // replay the ping hand-off (see handoff) lets the peers catch up at every
        // timeframe boundary.
        await Lockstep.acquireLock(LOCKSTEP_SOURCE);
        cursor.locked = true;
        try {
          const timeframeStartTime = performance.now();
          // an open command queued for this idle strategy (stamped with the time meta's minute
          // at the call): tick on the minute after it, off the grid
          if (retickAt === null && i > 0) {
            retickAt = await QUEUED_OPEN_WAKE_FN(this, symbol, lastWhen, timeframes[i].getTime());
          }
          const when = retickAt !== null ? new Date(retickAt) : timeframes[i];
          {
            // the hand-off boundaries of a replay stay on the grid of the entry steps: a re-tick
            // off the grid counts them from the last entry step before it
            const step = LOCKSTEP_STEP_FN();
            let boundary = (retickAt !== null ? timeframes[i - 1].getTime() : when.getTime()) + step;
            while (boundary <= when.getTime()) {
              boundary += step;
            }
            cursor.nextBoundary = boundary;
          }
          // time barrier: no iteration starts before every running peer has reached its timeframe;
          // a peer's event may queue an open command meanwhile — the barrier wakes this strategy
          // on the minute after it and the iteration is re-entered there
          if (GLOBAL_CONFIG.CC_BACKTEST_LOCKSTEP) {
            const wake = retickAt === null && i > 0 ? () => QUEUED_OPEN_WAKE_FN(this, symbol, lastWhen, when.getTime()) : undefined;
            const wokeAt = await WAIT_FOR_PEERS_FN(this, cursor, when.getTime(), "start", false, wake);
            if (wokeAt !== null) {
              retickAt = wokeAt;
              continue;
            }
          }
          cursor.clock = when.getTime();
          lastWhen = when.getTime();

          // the re-tick of a close minute reports progress with its own minute: the fraction of
          // entry steps is unchanged, `when` is where the cursor is
          await EMIT_PROGRESS_FN(this, symbol, totalFrames, i, when);

          if (globalThis[KILL_SYMBOL]) {
            this.loggerService.info(
              "backtestLogicPrivateService stopped by kill flag",
              {
                symbol,
                when: when.toISOString(),
                processedFrames: i,
                totalFrames,
              }
            );
            break;
          }

          if (await CHECK_STOPPED_FN(this, symbol, "before tick", { when: when.toISOString(), processedFrames: i, totalFrames })) {
            break;
          }

          const result = await TICK_FN(this, symbol, when);
          if ("__error__" in result) {
            _fatalError = new Error(`[${result.reason}] ${result.message}`);
            break;
          }
          lastAction = result.action;

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
              lastAction = "closed";
              previousEventTimestamp = r.previousEventTimestamp;
              // Skip the frames before closeTimestamp: the close is dated at the clock of the
              // candle that closed it, and the entry step of that very minute stays tickable
              // (the candle is closed, the strategy is idle), so continue past the loop-bottom i++.
              retickAt = null;
              while (i < timeframes.length && timeframes[i].getTime() < r.closeTimestamp) {
                i++;
              }
              if (i < timeframes.length && timeframes[i].getTime() !== r.closeTimestamp) {
                retickAt = r.closeTimestamp;
              }
              if (r.shouldStop) {
                break;
              }
              previousEventTimestamp = await EMIT_TIMEFRAME_PERFORMANCE_FN(this, symbol, timeframeStartTime, previousEventTimestamp, when);
              continue;
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
              lastAction = "closed";
              previousEventTimestamp = r.previousEventTimestamp;
              // Same off-by-one guard as in the scheduled branch above.
              retickAt = null;
              while (i < timeframes.length && timeframes[i].getTime() < r.closeTimestamp) {
                i++;
              }
              if (i < timeframes.length && timeframes[i].getTime() !== r.closeTimestamp) {
                retickAt = r.closeTimestamp;
              }
              if (r.shouldStop) {
                break;
              }
              previousEventTimestamp = await EMIT_TIMEFRAME_PERFORMANCE_FN(this, symbol, timeframeStartTime, previousEventTimestamp, when);
              continue;
            }
          }

          previousEventTimestamp = await EMIT_TIMEFRAME_PERFORMANCE_FN(this, symbol, timeframeStartTime, previousEventTimestamp, when);

          if (retickAt !== null) {
            retickAt = null;
          } else {
            i++;
          }
        } finally {
          cursor.locked = false;
          await Lockstep.releaseLock(LOCKSTEP_SOURCE);
        }
      }

      // The timeframe loop is exhausted with a signal still open (a position that
      // reached the frame end through "skip" or the tick() path, a scheduled
      // signal that never activated): replay the frame end with NO candles —
      // ClientStrategy.backtest treats an empty series as "the frame is over"
      // and closes by time_expired / cancels by timeout at frameEndTime.
      if (i >= timeframes.length && lastAction !== null && lastAction !== "idle" && lastAction !== "closed" && lastAction !== "cancelled") {
        // The frame-end close commits and emits like any other iteration: under the lock
        await Lockstep.acquireLock(LOCKSTEP_SOURCE);
        // a user activation still queued at the frame end opens there and expires with the
        // frame: its opened tick is forwarded and yielded before the close, as in a replay
        const frameEndContext = {
          strategyName: this.methodContextService.context.strategyName,
          exchangeName: this.methodContextService.context.exchangeName,
          frameName: this.methodContextService.context.frameName,
        };
        const scheduleOpen = SUBSCRIBE_SCHEDULE_OPEN_FN(this, symbol, frameEndContext);
        try {
          const expired = await BACKTEST_FN(this, symbol, [], frameEndTime, new Date(frameEndTime), frameEndContext, { reason: "frame end" });
          if ("__error__" in expired) {
            _fatalError = new Error(`[${expired.reason}] ${expired.message}`);
          } else if (expired.action !== "active") {
            const opened = scheduleOpen.opened();
            if (opened) {
              yield opened;
            }
            yield expired;
          }
        } finally {
          scheduleOpen.unsubscribe();
          await Lockstep.releaseLock(LOCKSTEP_SOURCE);
        }
      }

      // Emit final progress event (100%)
      await EMIT_PROGRESS_FN(this, symbol, totalFrames, totalFrames, new Date(frameEndTime));

      // Track total backtest duration
      const backtestEndTime = performance.now();
      const currentTimestamp = Date.now();
      try {
        await performanceEmitter.next({
          timestamp: currentTimestamp,
          previousTimestamp: previousEventTimestamp,
          when: new Date(frameEndTime),
          metricType: "backtest_total",
          duration: backtestEndTime - backtestStartTime,
          strategyName: this.methodContextService.context.strategyName,
          exchangeName: this.methodContextService.context.exchangeName,
          frameName: this.methodContextService.context.frameName,
          symbol,
          backtest: true,
        });
      } catch (error) {
        EMIT_FAILED_FN(this, "performanceEmitter", symbol, error);
      }
    } catch (error) {
      _fatalError = error;
    } finally {
      LOCKSTEP_CURSORS.delete(lockstepKey);
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
