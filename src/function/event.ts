import backtest from "../lib";
import { signalEmitter, signalLiveEmitter, signalBacktestEmitter, errorEmitter, doneEmitter, progressEmitter, performanceEmitter, walkerEmitter } from "../config/emitters";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";
import { DoneContract } from "../contract/Done.contract";
import { ProgressContract } from "../contract/Progress.contract";
import { PerformanceContract } from "../contract/Performance.contract";
import { WalkerContract } from "../contract/Walker.contract";
import { queued } from "functools-kit";

const LISTEN_SIGNAL_METHOD_NAME = "event.listenSignal";
const LISTEN_SIGNAL_ONCE_METHOD_NAME = "event.listenSignalOnce";
const LISTEN_SIGNAL_LIVE_METHOD_NAME = "event.listenSignalLive";
const LISTEN_SIGNAL_LIVE_ONCE_METHOD_NAME = "event.listenSignalLiveOnce";
const LISTEN_SIGNAL_BACKTEST_METHOD_NAME = "event.listenSignalBacktest";
const LISTEN_SIGNAL_BACKTEST_ONCE_METHOD_NAME = "event.listenSignalBacktestOnce";
const LISTEN_ERROR_METHOD_NAME = "event.listenError";
const LISTEN_DONE_METHOD_NAME = "event.listenDone";
const LISTEN_DONE_ONCE_METHOD_NAME = "event.listenDoneOnce";
const LISTEN_PROGRESS_METHOD_NAME = "event.listenProgress";
const LISTEN_PERFORMANCE_METHOD_NAME = "event.listenPerformance";
const LISTEN_WALKER_METHOD_NAME = "event.listenWalker";
const LISTEN_WALKER_ONCE_METHOD_NAME = "event.listenWalkerOnce";

/**
 * Subscribes to all signal events with queued async processing.
 *
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle signal events (idle, opened, active, closed)
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignal } from "./function/event";
 *
 * const unsubscribe = listenSignal((event) => {
 *   if (event.action === "opened") {
 *     console.log("New signal opened:", event.signal);
 *   } else if (event.action === "closed") {
 *     console.log("Signal closed with PNL:", event.pnl.pnlPercentage);
 *   }
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenSignal(fn: (event: IStrategyTickResult) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_METHOD_NAME);
  return signalEmitter.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered signal events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific signal conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenSignalOnce } from "./function/event";
 *
 * // Wait for first take profit hit
 * listenSignalOnce(
 *   (event) => event.action === "closed" && event.closeReason === "take_profit",
 *   (event) => {
 *     console.log("Take profit hit! PNL:", event.pnl.pnlPercentage);
 *   }
 * );
 *
 * // Wait for any signal to close on BTCUSDT
 * const cancel = listenSignalOnce(
 *   (event) => event.action === "closed" && event.signal.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT signal closed")
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
export function listenSignalOnce(
  filterFn: (event: IStrategyTickResult) => boolean,
  fn: (event: IStrategyTickResult) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_ONCE_METHOD_NAME);
  return signalEmitter.filter(filterFn).once(fn);
}

/**
 * Subscribes to live trading signal events with queued async processing.
 *
 * Only receives events from Live.run() execution.
 * Events are processed sequentially in order received.
 *
 * @param fn - Callback function to handle live signal events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalLive } from "./function/event";
 *
 * const unsubscribe = listenSignalLive((event) => {
 *   if (event.action === "closed") {
 *     console.log("Live signal closed:", event.pnl.pnlPercentage);
 *   }
 * });
 * ```
 */
export function listenSignalLive(fn: (event: IStrategyTickResult) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_METHOD_NAME);
  return signalLiveEmitter.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered live signal events with one-time execution.
 *
 * Only receives events from Live.run() execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenSignalLiveOnce } from "./function/event";
 *
 * // Wait for first live take profit hit
 * listenSignalLiveOnce(
 *   (event) => event.action === "closed" && event.closeReason === "take_profit",
 *   (event) => console.log("Live take profit:", event.pnl.pnlPercentage)
 * );
 * ```
 */
export function listenSignalLiveOnce(
  filterFn: (event: IStrategyTickResult) => boolean,
  fn: (event: IStrategyTickResult) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_ONCE_METHOD_NAME);
  return signalLiveEmitter.filter(filterFn).once(fn);
}

/**
 * Subscribes to backtest signal events with queued async processing.
 *
 * Only receives events from Backtest.run() execution.
 * Events are processed sequentially in order received.
 *
 * @param fn - Callback function to handle backtest signal events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalBacktest } from "./function/event";
 *
 * const unsubscribe = listenSignalBacktest((event) => {
 *   if (event.action === "closed") {
 *     console.log("Backtest signal closed:", event.pnl.pnlPercentage);
 *   }
 * });
 * ```
 */
export function listenSignalBacktest(fn: (event: IStrategyTickResult) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_METHOD_NAME);
  return signalBacktestEmitter.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered backtest signal events with one-time execution.
 *
 * Only receives events from Backtest.run() execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenSignalBacktestOnce } from "./function/event";
 *
 * // Wait for first backtest stop loss hit
 * listenSignalBacktestOnce(
 *   (event) => event.action === "closed" && event.closeReason === "stop_loss",
 *   (event) => console.log("Backtest stop loss:", event.pnl.pnlPercentage)
 * );
 * ```
 */
export function listenSignalBacktestOnce(
  filterFn: (event: IStrategyTickResult) => boolean,
  fn: (event: IStrategyTickResult) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_ONCE_METHOD_NAME);
  return signalBacktestEmitter.filter(filterFn).once(fn);
}

/**
 * Subscribes to background execution errors with queued async processing.
 *
 * Listens to errors caught in Live.background() and Backtest.background() execution.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle error events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenError } from "./function/event";
 *
 * const unsubscribe = listenError((error) => {
 *   console.error("Background execution error:", error.message);
 *   // Log to monitoring service, send alerts, etc.
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenError(fn: (error: Error) => void) {
  backtest.loggerService.log(LISTEN_ERROR_METHOD_NAME);
  return errorEmitter.subscribe(queued(async (error) => fn(error)));
}

/**
 * Subscribes to background execution completion events with queued async processing.
 *
 * Emits when Live.background() or Backtest.background() completes execution.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle completion events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenDone, Live } from "backtest-kit";
 *
 * const unsubscribe = listenDone((event) => {
 *   console.log("Completed:", event.strategyName, event.exchangeName, event.symbol);
 *   if (event.backtest) {
 *     console.log("Backtest mode completed");
 *   }
 * });
 *
 * Live.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenDone(fn: (event: DoneContract) => void) {
  backtest.loggerService.log(LISTEN_DONE_METHOD_NAME);
  return doneEmitter.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered background execution completion events with one-time execution.
 *
 * Emits when Live.background() or Backtest.background() completes execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenDoneOnce, Backtest } from "backtest-kit";
 *
 * // Wait for first backtest completion
 * listenDoneOnce(
 *   (event) => event.backtest && event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT backtest completed:", event.strategyName)
 * );
 *
 * Backtest.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 * ```
 */
export function listenDoneOnce(
  filterFn: (event: DoneContract) => boolean,
  fn: (event: DoneContract) => void
) {
  backtest.loggerService.log(LISTEN_DONE_ONCE_METHOD_NAME);
  return doneEmitter.filter(filterFn).once(fn);
}

/**
 * Subscribes to backtest progress events with queued async processing.
 *
 * Emits during Backtest.background() execution to track progress.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle progress events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenProgress, Backtest } from "backtest-kit";
 *
 * const unsubscribe = listenProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`${event.processedFrames} / ${event.totalFrames} frames`);
 *   console.log(`Strategy: ${event.strategyName}, Symbol: ${event.symbol}`);
 * });
 *
 * Backtest.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenProgress(fn: (event: ProgressContract) => void) {
  backtest.loggerService.log(LISTEN_PROGRESS_METHOD_NAME);
  return progressEmitter.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to performance metric events with queued async processing.
 *
 * Emits during strategy execution to track timing metrics for operations.
 * Useful for profiling and identifying performance bottlenecks.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle performance events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenPerformance, Backtest } from "backtest-kit";
 *
 * const unsubscribe = listenPerformance((event) => {
 *   console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
 *   if (event.duration > 100) {
 *     console.warn("Slow operation detected:", event.metricType);
 *   }
 * });
 *
 * Backtest.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenPerformance(fn: (event: PerformanceContract) => void) {
  backtest.loggerService.log(LISTEN_PERFORMANCE_METHOD_NAME);
  return performanceEmitter.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to walker progress events with queued async processing.
 *
 * Emits during Walker.run() execution after each strategy completes.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle walker progress events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenWalker, Walker } from "backtest-kit";
 *
 * const unsubscribe = listenWalker((event) => {
 *   console.log(`Progress: ${event.strategiesTested} / ${event.totalStrategies}`);
 *   console.log(`Best strategy: ${event.bestStrategy} (${event.bestMetric})`);
 *   console.log(`Current strategy: ${event.strategyName} (${event.metricValue})`);
 * });
 *
 * Walker.run("BTCUSDT", {
 *   walkerName: "my-walker",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenWalker(fn: (event: WalkerContract) => void) {
  backtest.loggerService.log(LISTEN_WALKER_METHOD_NAME);
  return walkerEmitter.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered walker progress events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific walker conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenWalkerOnce, Walker } from "backtest-kit";
 *
 * // Wait for walker to complete all strategies
 * listenWalkerOnce(
 *   (event) => event.strategiesTested === event.totalStrategies,
 *   (event) => {
 *     console.log("Walker completed!");
 *     console.log("Best strategy:", event.bestStrategy, event.bestMetric);
 *   }
 * );
 *
 * // Wait for specific strategy to be tested
 * const cancel = listenWalkerOnce(
 *   (event) => event.strategyName === "my-strategy-v2",
 *   (event) => console.log("Strategy v2 tested:", event.metricValue)
 * );
 *
 * Walker.run("BTCUSDT", {
 *   walkerName: "my-walker",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
export function listenWalkerOnce(
  filterFn: (event: WalkerContract) => boolean,
  fn: (event: WalkerContract) => void
) {
  backtest.loggerService.log(LISTEN_WALKER_ONCE_METHOD_NAME);
  return walkerEmitter.filter(filterFn).once(fn);
}
