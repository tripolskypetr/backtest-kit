import backtest from "../lib";
import { signalEmitter, signalLiveEmitter, signalBacktestEmitter, errorEmitter, exitEmitter, doneLiveSubject, doneBacktestSubject, doneWalkerSubject, progressBacktestEmitter, progressWalkerEmitter, progressOptimizerEmitter, performanceEmitter, walkerEmitter, walkerCompleteSubject, validationSubject, partialProfitSubject, partialLossSubject, breakevenSubject, riskSubject, schedulePingSubject, activePingSubject } from "../config/emitters";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";
import { DoneContract } from "../contract/Done.contract";
import { ProgressBacktestContract } from "../contract/ProgressBacktest.contract";
import { ProgressWalkerContract } from "../contract/ProgressWalker.contract";
import { ProgressOptimizerContract } from "../contract/ProgressOptimizer.contract";
import { PerformanceContract } from "../contract/Performance.contract";
import { WalkerContract } from "../contract/Walker.contract";
import { WalkerCompleteContract } from "../contract/WalkerComplete.contract";
import { PartialProfitContract } from "../contract/PartialProfit.contract";
import { PartialLossContract } from "../contract/PartialLoss.contract";
import { BreakevenContract } from "../contract/Breakeven.contract";
import { RiskContract } from "../contract/Risk.contract";
import { SchedulePingContract } from "../contract/SchedulePing.contract";
import { ActivePingContract } from "../contract/ActivePing.contract";
import { queued } from "functools-kit";

const LISTEN_SIGNAL_METHOD_NAME = "event.listenSignal";
const LISTEN_SIGNAL_ONCE_METHOD_NAME = "event.listenSignalOnce";
const LISTEN_SIGNAL_LIVE_METHOD_NAME = "event.listenSignalLive";
const LISTEN_SIGNAL_LIVE_ONCE_METHOD_NAME = "event.listenSignalLiveOnce";
const LISTEN_SIGNAL_BACKTEST_METHOD_NAME = "event.listenSignalBacktest";
const LISTEN_SIGNAL_BACKTEST_ONCE_METHOD_NAME = "event.listenSignalBacktestOnce";
const LISTEN_ERROR_METHOD_NAME = "event.listenError";
const LISTEN_EXIT_METHOD_NAME = "event.listenExit";
const LISTEN_DONE_LIVE_METHOD_NAME = "event.listenDoneLive";
const LISTEN_DONE_LIVE_ONCE_METHOD_NAME = "event.listenDoneLiveOnce";
const LISTEN_DONE_BACKTEST_METHOD_NAME = "event.listenDoneBacktest";
const LISTEN_DONE_BACKTEST_ONCE_METHOD_NAME = "event.listenDoneBacktestOnce";
const LISTEN_DONE_WALKER_METHOD_NAME = "event.listenDoneWalker";
const LISTEN_DONE_WALKER_ONCE_METHOD_NAME = "event.listenDoneWalkerOnce";
const LISTEN_PROGRESS_METHOD_NAME = "event.listenBacktestProgress";
const LISTEN_PROGRESS_WALKER_METHOD_NAME = "event.listenWalkerProgress";
const LISTEN_PROGRESS_OPTIMIZER_METHOD_NAME = "event.listenOptimizerProgress";
const LISTEN_PERFORMANCE_METHOD_NAME = "event.listenPerformance";
const LISTEN_WALKER_METHOD_NAME = "event.listenWalker";
const LISTEN_WALKER_ONCE_METHOD_NAME = "event.listenWalkerOnce";
const LISTEN_WALKER_COMPLETE_METHOD_NAME = "event.listenWalkerComplete";
const LISTEN_VALIDATION_METHOD_NAME = "event.listenValidation";
const LISTEN_PARTIAL_PROFIT_METHOD_NAME = "event.listenPartialProfit";
const LISTEN_PARTIAL_PROFIT_ONCE_METHOD_NAME = "event.listenPartialProfitOnce";
const LISTEN_PARTIAL_LOSS_METHOD_NAME = "event.listenPartialLoss";
const LISTEN_PARTIAL_LOSS_ONCE_METHOD_NAME = "event.listenPartialLossOnce";
const LISTEN_BREAKEVEN_METHOD_NAME = "event.listenBreakeven";
const LISTEN_BREAKEVEN_ONCE_METHOD_NAME = "event.listenBreakevenOnce";
const LISTEN_RISK_METHOD_NAME = "event.listenRisk";
const LISTEN_RISK_ONCE_METHOD_NAME = "event.listenRiskOnce";
const LISTEN_SCHEDULE_PING_METHOD_NAME = "event.listenSchedulePing";
const LISTEN_SCHEDULE_PING_ONCE_METHOD_NAME = "event.listenSchedulePingOnce";
const LISTEN_ACTIVE_PING_METHOD_NAME = "event.listenActivePing";
const LISTEN_ACTIVE_PING_ONCE_METHOD_NAME = "event.listenActivePingOnce";

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
 * Subscribes to recoverable execution errors with queued async processing.
 *
 * Listens to recoverable errors during strategy execution (e.g., failed API calls).
 * These errors are caught and handled gracefully - execution continues.
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
 *   console.error("Recoverable error (execution continues):", error.message);
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
 * Subscribes to fatal execution errors with queued async processing.
 *
 * Listens to critical errors that terminate execution (Live.background, Backtest.background, Walker.background).
 * Unlike listenError (recoverable errors), these errors stop the current process.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle fatal error events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenExit } from "./function/event";
 *
 * const unsubscribe = listenExit((error) => {
 *   console.error("Fatal error (execution terminated):", error.message);
 *   // Log to monitoring, send alerts, restart process, etc.
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenExit(fn: (error: Error) => void) {
  backtest.loggerService.log(LISTEN_EXIT_METHOD_NAME);
  return exitEmitter.subscribe(queued(async (error) => fn(error)));
}

/**
 * Subscribes to live background execution completion events with queued async processing.
 *
 * Emits when Live.background() completes execution.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle completion events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenDoneLive, Live } from "backtest-kit";
 *
 * const unsubscribe = listenDoneLive((event) => {
 *   console.log("Live completed:", event.strategyName, event.exchangeName, event.symbol);
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
export function listenDoneLive(fn: (event: DoneContract) => void) {
  backtest.loggerService.log(LISTEN_DONE_LIVE_METHOD_NAME);
  return doneLiveSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered live background execution completion events with one-time execution.
 *
 * Emits when Live.background() completes execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenDoneLiveOnce, Live } from "backtest-kit";
 *
 * // Wait for first live completion
 * listenDoneLiveOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT live completed:", event.strategyName)
 * );
 *
 * Live.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance"
 * });
 * ```
 */
export function listenDoneLiveOnce(
  filterFn: (event: DoneContract) => boolean,
  fn: (event: DoneContract) => void
) {
  backtest.loggerService.log(LISTEN_DONE_LIVE_ONCE_METHOD_NAME);
  return doneLiveSubject.filter(filterFn).once(fn);
}

/**
 * Subscribes to backtest background execution completion events with queued async processing.
 *
 * Emits when Backtest.background() completes execution.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle completion events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenDoneBacktest, Backtest } from "backtest-kit";
 *
 * const unsubscribe = listenDoneBacktest((event) => {
 *   console.log("Backtest completed:", event.strategyName, event.exchangeName, event.symbol);
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
export function listenDoneBacktest(fn: (event: DoneContract) => void) {
  backtest.loggerService.log(LISTEN_DONE_BACKTEST_METHOD_NAME);
  return doneBacktestSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered backtest background execution completion events with one-time execution.
 *
 * Emits when Backtest.background() completes execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenDoneBacktestOnce, Backtest } from "backtest-kit";
 *
 * // Wait for first backtest completion
 * listenDoneBacktestOnce(
 *   (event) => event.symbol === "BTCUSDT",
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
export function listenDoneBacktestOnce(
  filterFn: (event: DoneContract) => boolean,
  fn: (event: DoneContract) => void
) {
  backtest.loggerService.log(LISTEN_DONE_BACKTEST_ONCE_METHOD_NAME);
  return doneBacktestSubject.filter(filterFn).once(fn);
}

/**
 * Subscribes to walker background execution completion events with queued async processing.
 *
 * Emits when Walker.background() completes execution.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle completion events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenDoneWalker, Walker } from "backtest-kit";
 *
 * const unsubscribe = listenDoneWalker((event) => {
 *   console.log("Walker completed:", event.strategyName, event.exchangeName, event.symbol);
 * });
 *
 * Walker.background("BTCUSDT", {
 *   walkerName: "my-walker"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenDoneWalker(fn: (event: DoneContract) => void) {
  backtest.loggerService.log(LISTEN_DONE_WALKER_METHOD_NAME);
  return doneWalkerSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered walker background execution completion events with one-time execution.
 *
 * Emits when Walker.background() completes execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenDoneWalkerOnce, Walker } from "backtest-kit";
 *
 * // Wait for first walker completion
 * listenDoneWalkerOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT walker completed:", event.strategyName)
 * );
 *
 * Walker.background("BTCUSDT", {
 *   walkerName: "my-walker"
 * });
 * ```
 */
export function listenDoneWalkerOnce(
  filterFn: (event: DoneContract) => boolean,
  fn: (event: DoneContract) => void
) {
  backtest.loggerService.log(LISTEN_DONE_WALKER_ONCE_METHOD_NAME);
  return doneWalkerSubject.filter(filterFn).once(fn);
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
 * import { listenBacktestProgress, Backtest } from "backtest-kit";
 *
 * const unsubscribe = listenBacktestProgress((event) => {
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
export function listenBacktestProgress(fn: (event: ProgressBacktestContract) => void) {
  backtest.loggerService.log(LISTEN_PROGRESS_METHOD_NAME);
  return progressBacktestEmitter.subscribe(queued(async (event) => fn(event)));
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
 * import { listenWalkerProgress, Walker } from "backtest-kit";
 *
 * const unsubscribe = listenWalkerProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`${event.processedStrategies} / ${event.totalStrategies} strategies`);
 *   console.log(`Walker: ${event.walkerName}, Symbol: ${event.symbol}`);
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
export function listenWalkerProgress(fn: (event: ProgressWalkerContract) => void) {
  backtest.loggerService.log(LISTEN_PROGRESS_WALKER_METHOD_NAME);
  return progressWalkerEmitter.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to optimizer progress events with queued async processing.
 *
 * Emits during optimizer execution to track data source processing progress.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle optimizer progress events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenOptimizerProgress } from "backtest-kit";
 *
 * const unsubscribe = listenOptimizerProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`${event.processedSources} / ${event.totalSources} sources`);
 *   console.log(`Optimizer: ${event.optimizerName}, Symbol: ${event.symbol}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenOptimizerProgress(fn: (event: ProgressOptimizerContract) => void) {
  backtest.loggerService.log(LISTEN_PROGRESS_OPTIMIZER_METHOD_NAME);
  return progressOptimizerEmitter.subscribe(queued(async (event) => fn(event)));
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

/**
 * Subscribes to walker completion events with queued async processing.
 *
 * Emits when Walker.run() completes testing all strategies.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle walker completion event
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenWalkerComplete, Walker } from "backtest-kit";
 *
 * const unsubscribe = listenWalkerComplete((results) => {
 *   console.log(`Walker ${results.walkerName} completed!`);
 *   console.log(`Best strategy: ${results.bestStrategy}`);
 *   console.log(`Best ${results.metric}: ${results.bestMetric}`);
 *   console.log(`Tested ${results.totalStrategies} strategies`);
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
export function listenWalkerComplete(fn: (event: WalkerCompleteContract) => void) {
  backtest.loggerService.log(LISTEN_WALKER_COMPLETE_METHOD_NAME);
  return walkerCompleteSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to risk validation errors with queued async processing.
 *
 * Emits when risk validation functions throw errors during signal checking.
 * Useful for debugging and monitoring risk validation failures.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle validation errors
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenValidation } from "./function/event";
 *
 * const unsubscribe = listenValidation((error) => {
 *   console.error("Risk validation error:", error.message);
 *   // Log to monitoring service for debugging
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenValidation(fn: (error: Error) => void) {
  backtest.loggerService.log(LISTEN_VALIDATION_METHOD_NAME);
  return validationSubject.subscribe(queued(async (error) => fn(error)));
}

/**
 * Subscribes to partial profit level events with queued async processing.
 *
 * Emits when a signal reaches a profit level milestone (10%, 20%, 30%, etc).
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle partial profit events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenPartialProfit } from "./function/event";
 *
 * const unsubscribe = listenPartialProfit((event) => {
 *   console.log(`Signal ${event.data.id} reached ${event.level}% profit`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 *   console.log(`Mode: ${event.backtest ? "Backtest" : "Live"}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenPartialProfitAvailable(fn: (event: PartialProfitContract) => void) {
  backtest.loggerService.log(LISTEN_PARTIAL_PROFIT_METHOD_NAME);
  return partialProfitSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered partial profit level events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific profit conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenPartialProfitOnce } from "./function/event";
 *
 * // Wait for first 50% profit level on any signal
 * listenPartialProfitOnce(
 *   (event) => event.level === 50,
 *   (event) => console.log("50% profit reached:", event.data.id)
 * );
 *
 * // Wait for 30% profit on BTCUSDT
 * const cancel = listenPartialProfitOnce(
 *   (event) => event.symbol === "BTCUSDT" && event.level === 30,
 *   (event) => console.log("BTCUSDT hit 30% profit")
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
export function listenPartialProfitAvailableOnce(
  filterFn: (event: PartialProfitContract) => boolean,
  fn: (event: PartialProfitContract) => void
) {
  backtest.loggerService.log(LISTEN_PARTIAL_PROFIT_ONCE_METHOD_NAME);
  return partialProfitSubject.filter(filterFn).once(fn);
}

/**
 * Subscribes to partial loss level events with queued async processing.
 *
 * Emits when a signal reaches a loss level milestone (10%, 20%, 30%, etc).
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle partial loss events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenPartialLoss } from "./function/event";
 *
 * const unsubscribe = listenPartialLoss((event) => {
 *   console.log(`Signal ${event.data.id} reached ${event.level}% loss`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 *   console.log(`Mode: ${event.backtest ? "Backtest" : "Live"}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenPartialLossAvailable(fn: (event: PartialLossContract) => void) {
  backtest.loggerService.log(LISTEN_PARTIAL_LOSS_METHOD_NAME);
  return partialLossSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered partial loss level events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific loss conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenPartialLossOnce } from "./function/event";
 *
 * // Wait for first 20% loss level on any signal
 * listenPartialLossOnce(
 *   (event) => event.level === 20,
 *   (event) => console.log("20% loss reached:", event.data.id)
 * );
 *
 * // Wait for 10% loss on ETHUSDT in live mode
 * const cancel = listenPartialLossOnce(
 *   (event) => event.symbol === "ETHUSDT" && event.level === 10 && !event.backtest,
 *   (event) => console.log("ETHUSDT hit 10% loss in live mode")
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
export function listenPartialLossAvailableOnce(
  filterFn: (event: PartialLossContract) => boolean,
  fn: (event: PartialLossContract) => void
) {
  backtest.loggerService.log(LISTEN_PARTIAL_LOSS_ONCE_METHOD_NAME);
  return partialLossSubject.filter(filterFn).once(fn);
}

/**
 * Subscribes to breakeven protection events with queued async processing.
 *
 * Emits when a signal's stop-loss is moved to breakeven (entry price).
 * This happens when price moves far enough in profit direction to cover transaction costs.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle breakeven events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenBreakeven } from "./function/event";
 *
 * const unsubscribe = listenBreakeven((event) => {
 *   console.log(`Signal ${event.data.id} reached breakeven`);
 *   console.log(`Symbol: ${event.symbol}, Position: ${event.data.position}`);
 *   console.log(`Entry: ${event.data.priceOpen}, Current: ${event.currentPrice}`);
 *   console.log(`Mode: ${event.backtest ? "Backtest" : "Live"}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenBreakevenAvailable(fn: (event: BreakevenContract) => void) {
  backtest.loggerService.log(LISTEN_BREAKEVEN_METHOD_NAME);
  return breakevenSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered breakeven protection events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific breakeven conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenBreakevenOnce } from "./function/event";
 *
 * // Wait for first breakeven on any signal
 * listenBreakevenOnce(
 *   (event) => true,
 *   (event) => console.log("First breakeven reached:", event.data.id)
 * );
 *
 * // Wait for breakeven on BTCUSDT LONG position
 * const cancel = listenBreakevenOnce(
 *   (event) => event.symbol === "BTCUSDT" && event.data.position === "long",
 *   (event) => console.log("BTCUSDT LONG reached breakeven at", event.currentPrice)
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
export function listenBreakevenAvailableOnce(
  filterFn: (event: BreakevenContract) => boolean,
  fn: (event: BreakevenContract) => void
) {
  backtest.loggerService.log(LISTEN_BREAKEVEN_ONCE_METHOD_NAME);
  return breakevenSubject.filter(filterFn).once(fn);
}

/**
 * Subscribes to risk rejection events with queued async processing.
 *
 * Emits ONLY when a signal is rejected due to risk validation failure.
 * Does not emit for allowed signals (prevents spam).
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle risk rejection events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenRisk } from "./function/event";
 *
 * const unsubscribe = listenRisk((event) => {
 *   console.log(`[RISK REJECTED] Signal for ${event.symbol}`);
 *   console.log(`Strategy: ${event.strategyName}`);
 *   console.log(`Position: ${event.pendingSignal.position}`);
 *   console.log(`Active positions: ${event.activePositionCount}`);
 *   console.log(`Reason: ${event.comment}`);
 *   console.log(`Price: ${event.currentPrice}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenRisk(fn: (event: RiskContract) => void) {
  backtest.loggerService.log(LISTEN_RISK_METHOD_NAME);
  return riskSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered risk rejection events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific risk rejection conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenRiskOnce } from "./function/event";
 *
 * // Wait for first risk rejection on BTCUSDT
 * listenRiskOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => {
 *     console.log("BTCUSDT signal rejected!");
 *     console.log("Reason:", event.comment);
 *   }
 * );
 *
 * // Wait for rejection due to position limit
 * const cancel = listenRiskOnce(
 *   (event) => event.comment.includes("Max") && event.activePositionCount >= 3,
 *   (event) => console.log("Position limit reached:", event.activePositionCount)
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
export function listenRiskOnce(
  filterFn: (event: RiskContract) => boolean,
  fn: (event: RiskContract) => void
) {
  backtest.loggerService.log(LISTEN_RISK_ONCE_METHOD_NAME);
  return riskSubject.filter(filterFn).once(fn);
}

/**
 * Subscribes to ping events during scheduled signal monitoring with queued async processing.
 *
 * Events are emitted every minute when a scheduled signal is being monitored (waiting for activation).
 * Allows tracking of scheduled signal lifecycle and custom monitoring logic.
 *
 * @param fn - Callback function to handle ping events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenPing } from "./function/event";
 *
 * const unsubscribe = listenPing((event) => {
 *   console.log(`Ping for ${event.symbol} at ${new Date(event.timestamp).toISOString()}`);
 *   console.log(`Strategy: ${event.strategyName}, Exchange: ${event.exchangeName}`);
 *   console.log(`Mode: ${event.backtest ? "Backtest" : "Live"}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenSchedulePing(fn: (event: SchedulePingContract) => void) {
  backtest.loggerService.log(LISTEN_SCHEDULE_PING_METHOD_NAME);
  return schedulePingSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered ping events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific ping conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenPingOnce } from "./function/event";
 *
 * // Wait for first ping on BTCUSDT
 * listenPingOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("First BTCUSDT ping received")
 * );
 *
 * // Wait for ping in backtest mode
 * const cancel = listenPingOnce(
 *   (event) => event.backtest === true,
 *   (event) => console.log("Backtest ping received at", new Date(event.timestamp))
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
export function listenSchedulePingOnce(
  filterFn: (event: SchedulePingContract) => boolean,
  fn: (event: SchedulePingContract) => void
) {
  backtest.loggerService.log(LISTEN_SCHEDULE_PING_ONCE_METHOD_NAME);
  return schedulePingSubject.filter(filterFn).once(fn);
}

/**
 * Subscribes to active ping events with queued async processing.
 *
 * Listens for active pending signal monitoring events emitted every minute.
 * Useful for tracking active signal lifecycle and implementing dynamic management logic.
 *
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle active ping events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenActivePing } from "./function/event";
 *
 * const unsubscribe = listenActivePing((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Active Ping`);
 *   console.log(`Symbol: ${event.symbol}, Strategy: ${event.strategyName}`);
 *   console.log(`Signal ID: ${event.data.id}, Position: ${event.data.position}`);
 *   console.log(`Timestamp: ${new Date(event.timestamp).toISOString()}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenActivePing(fn: (event: ActivePingContract) => void) {
  backtest.loggerService.log(LISTEN_ACTIVE_PING_METHOD_NAME);
  return activePingSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered active ping events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific active ping conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenActivePingOnce } from "./function/event";
 *
 * // Wait for first active ping on BTCUSDT
 * listenActivePingOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("First BTCUSDT active ping received")
 * );
 *
 * // Wait for active ping in backtest mode
 * const cancel = listenActivePingOnce(
 *   (event) => event.backtest === true,
 *   (event) => console.log("Backtest active ping received at", new Date(event.timestamp))
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
export function listenActivePingOnce(
  filterFn: (event: ActivePingContract) => boolean,
  fn: (event: ActivePingContract) => void
) {
  backtest.loggerService.log(LISTEN_ACTIVE_PING_ONCE_METHOD_NAME);
  return activePingSubject.filter(filterFn).once(fn);
}
