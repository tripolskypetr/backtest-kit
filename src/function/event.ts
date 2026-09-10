import backtest from "../lib";
import { signalEmitter, signalLiveEmitter, signalBacktestEmitter, errorEmitter, exitEmitter, doneLiveSubject, doneBacktestSubject, doneWalkerSubject, progressBacktestEmitter, progressWalkerEmitter, performanceEmitter, walkerEmitter, walkerCompleteSubject, validationSubject, partialProfitSubject, partialLossSubject, breakevenSubject, riskSubject, schedulePingSubject, scheduleEventSubject, signalEventSubject, activePingSubject, idlePingSubject, strategyCommitSubject, syncSubject, syncPendingSubject, orderFillSubject, orderRejectSubject, orderContinueSubject, orderStopSubject, highestProfitSubject, maxDrawdownSubject, worstStaleSubject, pauseSubject, signalNotifySubject, beforeStartSubject, afterEndSubject } from "../config/emitters";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";
import { DoneContract } from "../contract/Done.contract";
import { ProgressBacktestContract } from "../contract/ProgressBacktest.contract";
import { ProgressWalkerContract } from "../contract/ProgressWalker.contract";
import { PerformanceContract } from "../contract/Performance.contract";
import { WalkerContract } from "../contract/Walker.contract";
import { WalkerCompleteContract } from "../contract/WalkerComplete.contract";
import { PartialProfitContract } from "../contract/PartialProfit.contract";
import { PartialLossContract } from "../contract/PartialLoss.contract";
import { BreakevenContract } from "../contract/Breakeven.contract";
import { RiskContract } from "../contract/Risk.contract";
import { SchedulePingContract } from "../contract/SchedulePing.contract";
import { ScheduleEventContract } from "../contract/ScheduleEvent.contract";
import { SignalEventContract } from "../contract/SignalEvent.contract";
import { ActivePingContract } from "../contract/ActivePing.contract";
import { IdlePingContract } from "../contract/IdlePing.contract";
import { StrategyCommitContract } from "../contract/StrategyCommit.contract";
import { not, queued, LimitedMap } from "functools-kit";
import OrderSyncContract from "../contract/OrderSync.contract";
import OrderFillContract from "../contract/OrderFill.contract";
import OrderRejectContract from "../contract/OrderReject.contract";
import OrderContinueContract from "../contract/OrderContinue.contract";
import OrderStopContract from "../contract/OrderStop.contract";
import OrderCheckContract from "../contract/OrderCheck.contract";
import { HighestProfitContract } from "../contract/HighestProfit.contract";
import { MaxDrawdownContract } from "../contract/MaxDrawdown.contract";
import { WorstStaleContract } from "../contract/WorstStale.contract";
import { PauseContract } from "../contract/Pause.contract";
import { SignalInfoContract } from "../contract/SignalInfo.contract";
import { BeforeStartContract } from "../contract/BeforeStart.contract";
import { AfterEndContract } from "../contract/AfterEnd.contract";

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
const LISTEN_PERFORMANCE_METHOD_NAME = "event.listenPerformance";
const LISTEN_WALKER_METHOD_NAME = "event.listenWalker";
const LISTEN_WALKER_ONCE_METHOD_NAME = "event.listenWalkerOnce";
const LISTEN_WALKER_COMPLETE_METHOD_NAME = "event.listenWalkerComplete";
const LISTEN_VALIDATION_METHOD_NAME = "event.listenValidation";
const LISTEN_PARTIAL_PROFIT_METHOD_NAME = "event.listenPartialProfitAvailable";
const LISTEN_PARTIAL_PROFIT_ONCE_METHOD_NAME = "event.listenPartialProfitAvailableOnce";
const LISTEN_PARTIAL_LOSS_METHOD_NAME = "event.listenPartialLossAvailable";
const LISTEN_PARTIAL_LOSS_ONCE_METHOD_NAME = "event.listenPartialLossAvailableOnce";
const LISTEN_BREAKEVEN_METHOD_NAME = "event.listenBreakevenAvailable";
const LISTEN_BREAKEVEN_ONCE_METHOD_NAME = "event.listenBreakevenAvailableOnce";
const LISTEN_RISK_METHOD_NAME = "event.listenRisk";
const LISTEN_RISK_ONCE_METHOD_NAME = "event.listenRiskOnce";
const LISTEN_SCHEDULE_PING_METHOD_NAME = "event.listenSchedulePing";
const LISTEN_SCHEDULE_PING_ONCE_METHOD_NAME = "event.listenSchedulePingOnce";
const LISTEN_ORDER_SCHEDULE_METHOD_NAME = "event.listenOrderSchedule";
const LISTEN_SIGNAL_EVENT_METHOD_NAME = "event.listenSignalEvent";
const LISTEN_SIGNAL_EVENT_ONCE_METHOD_NAME = "event.listenSignalEventOnce";
const LISTEN_ACTIVE_PING_METHOD_NAME = "event.listenActivePing";
const LISTEN_ACTIVE_PING_ONCE_METHOD_NAME = "event.listenActivePingOnce";
const LISTEN_IDLE_PING_METHOD_NAME = "event.listenIdlePing";
const LISTEN_IDLE_PING_ONCE_METHOD_NAME = "event.listenIdlePingOnce";
const LISTEN_STRATEGY_COMMIT_METHOD_NAME = "event.listenStrategyCommit";
const LISTEN_STRATEGY_COMMIT_ONCE_METHOD_NAME = "event.listenStrategyCommitOnce";
const LISTEN_SYNC_METHOD_NAME = "event.listenSync";
const LISTEN_ORDER_FILL_METHOD_NAME = "event.listenOrderFill";
const LISTEN_ORDER_REJECT_METHOD_NAME = "event.listenOrderReject";
const LISTEN_ORDER_CONTINUE_METHOD_NAME = "event.listenOrderContinue";
const LISTEN_ORDER_STOP_METHOD_NAME = "event.listenOrderStop";
const LISTEN_CHECK_METHOD_NAME = "event.listenCheck";
const LISTEN_HIGHEST_PROFIT_METHOD_NAME = "event.listenHighestProfit";
const LISTEN_HIGHEST_PROFIT_ONCE_METHOD_NAME = "event.listenHighestProfitOnce";
const LISTEN_MAX_DRAWDOWN_METHOD_NAME = "event.listenMaxDrawdown";
const LISTEN_MAX_DRAWDOWN_ONCE_METHOD_NAME = "event.listenMaxDrawdownOnce";
const LISTEN_WORST_STALE_METHOD_NAME = "event.listenWorstStale";
const LISTEN_WORST_STALE_ONCE_METHOD_NAME = "event.listenWorstStaleOnce";
const LISTEN_PAUSE_METHOD_NAME = "event.listenPause";
const LISTEN_PAUSE_ONCE_METHOD_NAME = "event.listenPauseOnce";
const LISTEN_SIGNAL_NOTIFY_METHOD_NAME = "event.listenSignalNotify";
const LISTEN_SIGNAL_NOTIFY_ONCE_METHOD_NAME = "event.listenSignalNotifyOnce";
const LISTEN_BEFORE_START_METHOD_NAME = "event.listenBeforeStart";
const LISTEN_BEFORE_START_ONCE_METHOD_NAME = "event.listenBeforeStartOnce";
const LISTEN_AFTER_END_METHOD_NAME = "event.listenAfterEnd";
const LISTEN_AFTER_END_ONCE_METHOD_NAME = "event.listenAfterEndOnce";

/**
 * How many execution identities one `listenXPerSignal` subscription remembers.
 *
 * Each entry is `executionKey -> last delivered signal id`. One entry per
 * strategy/exchange/frame/mode/symbol combination being monitored, so the bound
 * only matters for a subscription spanning an unusually wide fleet; the oldest
 * entry is evicted first (FIFO). An evicted identity simply reports its current
 * signal once more.
 */
const SEEN_MAP_LIMIT = 200;

const LISTEN_SIGNAL_PER_SIGNAL_METHOD_NAME = "event.listenSignalPerSignal";
const LISTEN_SIGNAL_LIVE_PER_SIGNAL_METHOD_NAME = "event.listenSignalLivePerSignal";
const LISTEN_SIGNAL_BACKTEST_PER_SIGNAL_METHOD_NAME = "event.listenSignalBacktestPerSignal";
const LISTEN_SIGNAL_EVENT_PER_SIGNAL_METHOD_NAME = "event.listenSignalEventPerSignal";
const LISTEN_ORDER_SCHEDULE_PER_SIGNAL_METHOD_NAME = "event.listenOrderSchedulePerSignal";
const LISTEN_ACTIVE_PING_PER_SIGNAL_METHOD_NAME = "event.listenActivePingPerSignal";
const LISTEN_SCHEDULE_PING_PER_SIGNAL_METHOD_NAME = "event.listenSchedulePingPerSignal";
const LISTEN_PARTIAL_PROFIT_PER_SIGNAL_METHOD_NAME = "event.listenPartialProfitAvailablePerSignal";
const LISTEN_PARTIAL_LOSS_PER_SIGNAL_METHOD_NAME = "event.listenPartialLossAvailablePerSignal";
const LISTEN_BREAKEVEN_PER_SIGNAL_METHOD_NAME = "event.listenBreakevenAvailablePerSignal";
const LISTEN_HIGHEST_PROFIT_PER_SIGNAL_METHOD_NAME = "event.listenHighestProfitPerSignal";
const LISTEN_MAX_DRAWDOWN_PER_SIGNAL_METHOD_NAME = "event.listenMaxDrawdownPerSignal";
const LISTEN_WORST_STALE_PER_SIGNAL_METHOD_NAME = "event.listenWorstStalePerSignal";
const LISTEN_SIGNAL_NOTIFY_PER_SIGNAL_METHOD_NAME = "event.listenSignalNotifyPerSignal";
const LISTEN_STRATEGY_COMMIT_PER_SIGNAL_METHOD_NAME = "event.listenStrategyCommitPerSignal";

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

  let disposeFn: Function;

  const wrappedFn = async (event: IStrategyTickResult) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenSignal(wrappedFn);
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

  let disposeFn: Function;

  const wrappedFn = async (event: IStrategyTickResult) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenSignalLive(wrappedFn);
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

  let disposeFn: Function;

  const wrappedFn = async (event: IStrategyTickResult) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenSignalBacktest(wrappedFn);
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

  let disposeFn: Function;

  const wrappedFn = async (event: DoneContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenDoneLive(wrappedFn);
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

  let disposeFn: Function;

  const wrappedFn = async (event: DoneContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenDoneBacktest(wrappedFn);
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

  let disposeFn: Function;

  const wrappedFn = async (event: DoneContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenDoneWalker(wrappedFn);
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

  let disposeFn: Function;

  const wrappedFn = async (event: WalkerContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenWalker(wrappedFn);
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
 * import { listenPartialProfitAvailable } from "./function/event";
 *
 * const unsubscribe = listenPartialProfitAvailable((event) => {
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

  const wrappedFn = async (event: PartialProfitContract) => {
    if (
      await backtest.strategyCoreService.hasPendingSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      )
    ) {
      await fn(event);
    }
  };

  return partialProfitSubject.subscribe(queued(wrappedFn));
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

  let disposeFn: Function;

  const wrappedFn = async (event: PartialProfitContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenPartialProfitAvailable(wrappedFn);
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
 * import { listenPartialLossAvailable } from "./function/event";
 *
 * const unsubscribe = listenPartialLossAvailable((event) => {
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

  const wrappedFn = async (event: PartialLossContract) => {
    if (
      await backtest.strategyCoreService.hasPendingSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      )
    ) {
      await fn(event);
    }
  };

  return partialLossSubject.subscribe(queued(wrappedFn));
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

  let disposeFn: Function;

  const wrappedFn = async (event: PartialLossContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenPartialLossAvailable(wrappedFn);
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
 * import { listenBreakevenAvailable } from "./function/event";
 *
 * const unsubscribe = listenBreakevenAvailable((event) => {
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

  const wrappedFn = async (event: BreakevenContract) => {
    if (
      await backtest.strategyCoreService.hasPendingSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      )
    ) {
      await fn(event);
    }
  };

  return breakevenSubject.subscribe(queued(wrappedFn));
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

  let disposeFn: Function;

  const wrappedFn = async (event: BreakevenContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenBreakevenAvailable(wrappedFn);
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

  let disposeFn: Function;

  const wrappedFn = async (event: RiskContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenRisk(wrappedFn);
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

  const wrappedFn = async (event: SchedulePingContract) => {
    if (
      await backtest.strategyCoreService.hasScheduledSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.data.strategyName,
          exchangeName: event.data.exchangeName,
          frameName: event.data.frameName,
        },
      )
    ) {
      await fn(event);
    }
  };

  return schedulePingSubject.subscribe(queued(wrappedFn));
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

  let disposeFn: Function;

  const wrappedFn = async (event: SchedulePingContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenSchedulePing(wrappedFn);
}

/**
 * Subscribes to resting-entry (scheduled order) lifecycle events with queued async processing.
 *
 * Emitted when a scheduled signal is created (action "scheduled") - the strategy asked for an
 * entry at a specific price and the engine now waits for the market to reach it - or when that
 * entry is dropped before activating (action "cancelled" with reason "timeout" / "price_reject" /
 * "user"). Fires in both live and backtest.
 *
 * IMPORTANT: The scheduled -> active transition (activation) is NOT reported here. Activation
 * produces an "opened" event on the regular signal emitters (listenSignal) instead.
 *
 * SYSTEM CHANNEL. This is the same stream the framework itself consumes: Broker subscribes to it
 * and fans each event out to the registered adapter as `onSignalScheduleOpen` (action "scheduled",
 * payload BrokerScheduleOpenPayload) or `onSignalScheduleCancelled` (action "cancelled", payload
 * BrokerScheduleCancelledPayload, carrying `reason`). Because it is systemic it is NOT gated on
 * "is a scheduled signal still live" - every emission is delivered, including the cancellation that
 * reports the entry is already gone.
 *
 * For exchange integration prefer Broker.useBrokerAdapter with those two hooks; this listener is
 * for observation - logging, notifications, audit.
 *
 * Events are processed sequentially in order received, even if callback is async.
 *
 * @param fn - Callback function to handle scheduled lifecycle events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenOrderSchedule } from "./function/event";
 *
 * const unsubscribe = listenOrderSchedule((event) => {
 *   if (event.action === "scheduled") {
 *     console.log(`Scheduled ${event.symbol} @ ${event.data.priceOpen}`);
 *   } else {
 *     console.log(`Cancelled ${event.symbol} (reason: ${event.reason})`);
 *   }
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenOrderSchedule(fn: (event: ScheduleEventContract) => void) {
  backtest.loggerService.log(LISTEN_ORDER_SCHEDULE_METHOD_NAME);
  return scheduleEventSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to pending signal lifecycle events (open and close) with queued async processing.
 *
 * Emitted when a pending position is opened (action "opened": new signal / immediate / scheduled
 * or user activation) or closed (action "closed" with closeReason "take_profit" / "stop_loss" /
 * "time_expired" / "closed"), in both live and backtest.
 *
 * Events are processed sequentially in order received, even if callback is async.
 *
 * @param fn - Callback function to handle pending lifecycle events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalEvent } from "./function/event";
 *
 * const unsubscribe = listenSignalEvent((event) => {
 *   if (event.action === "opened") {
 *     console.log(`Opened ${event.symbol} @ ${event.data.priceOpen}`);
 *   } else {
 *     console.log(`Closed ${event.symbol} (reason: ${event.closeReason})`);
 *   }
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenSignalEvent(fn: (event: SignalEventContract) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_EVENT_METHOD_NAME);
  return signalEventSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered pending lifecycle events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for a specific open or close.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenSignalEventOnce } from "./function/event";
 *
 * // Wait for the first close on BTCUSDT
 * listenSignalEventOnce(
 *   (event) => event.symbol === "BTCUSDT" && event.action === "closed",
 *   (event) => console.log("BTCUSDT closed:", event.closeReason)
 * );
 * ```
 */
export function listenSignalEventOnce(
  filterFn: (event: SignalEventContract) => boolean,
  fn: (event: SignalEventContract) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_EVENT_ONCE_METHOD_NAME);

  let disposeFn: Function;

  const wrappedFn = async (event: SignalEventContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenSignalEvent(wrappedFn);
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

  const wrappedFn = async (event: ActivePingContract) => {
    if (
      await backtest.strategyCoreService.hasPendingSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.data.strategyName,
          exchangeName: event.data.exchangeName,
          frameName: event.data.frameName,
        },
      )
    ) {
      await fn(event);
    }
  };

  return activePingSubject.subscribe(queued(wrappedFn));
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

  let disposeFn: Function;

  const wrappedFn = async (event: ActivePingContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenActivePing(wrappedFn)
}

/**
 * Subscribes to idle ping events with queued async processing.
 *
 * Emits every tick when there is no pending or scheduled signal being monitored.
 *
 * @param fn - Callback function to handle idle ping events
 * @returns Unsubscribe function to stop listening
 */
export function listenIdlePing(fn: (event: IdlePingContract) => void) {
  backtest.loggerService.log(LISTEN_IDLE_PING_METHOD_NAME);

  const wrappedFn = async (event: IdlePingContract) => {
    if (
      await not(
        backtest.strategyCoreService.hasPendingSignal(
          event.backtest,
          event.symbol,
          {
            strategyName: event.strategyName,
            exchangeName: event.exchangeName,
            frameName: event.frameName,
          },
        )
      )
    ) {
      await fn(event);
    }
  };

  return idlePingSubject.subscribe(queued(wrappedFn));
}

/**
 * Subscribes to filtered idle ping events with one-time execution.
 *
 * @param filterFn - Predicate to filter events
 * @param fn - Callback function to handle the matching event
 * @returns Unsubscribe function to cancel the listener before it fires
 */
export function listenIdlePingOnce(
  filterFn: (event: IdlePingContract) => boolean,
  fn: (event: IdlePingContract) => void
) {
  backtest.loggerService.log(LISTEN_IDLE_PING_ONCE_METHOD_NAME);

  let disposeFn: Function;

  const wrappedFn = async (event: IdlePingContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenIdlePing(wrappedFn);
}

/**
 * Subscribes to strategy management events with queued async processing.
 *
 * Emits when strategy management actions are executed:
 * - cancel-scheduled: Scheduled signal cancelled
 * - close-pending: Pending signal closed
 * - partial-profit: Partial close at profit level
 * - partial-loss: Partial close at loss level
 * - trailing-stop: Stop-loss adjusted
 * - trailing-take: Take-profit adjusted
 * - breakeven: Stop-loss moved to entry price
 *
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle strategy commit events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenStrategyCommit } from "./function/event";
 *
 * const unsubscribe = listenStrategyCommit((event) => {
 *   console.log(`[${event.action}] ${event.symbol}`);
 *   console.log(`Strategy: ${event.strategyName}, Exchange: ${event.exchangeName}`);
 *   if (event.action === "partial-profit") {
 *     console.log(`Closed ${event.percentToClose}% at ${event.currentPrice}`);
 *   }
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
export function listenStrategyCommit(fn: (event: StrategyCommitContract) => void) {
  backtest.loggerService.log(LISTEN_STRATEGY_COMMIT_METHOD_NAME);

  const wrappedFn = async (event: StrategyCommitContract) => {
    if (event.action === "cancel-scheduled") {
      await fn(event);
      return;
    }
    if (event.action === "close-pending") {
      await fn(event);
      return;
    }
    if (
      await backtest.strategyCoreService.hasPendingSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      )
    ) {
      await fn(event);
      return;
    }
    // The pending signal may already be routed into a deferred user close
    // (closePending or the full-partial auto-close): the position is closing,
    // not gone — queued partial/trailing commits attributed to that snapshot
    // (same signal id) must still reach the subscriber. Without this check the
    // FINAL 100%-partial commit was silently filtered out here.
    {
      const status = await backtest.strategyCoreService.getStatus(
        event.backtest,
        event.symbol,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      );
      if (status.closedSignal && status.closedSignal.id === event.signalId) {
        await fn(event);
      }
    }
  };

  return strategyCommitSubject.subscribe(queued(wrappedFn));
}

/**
 * Subscribes to filtered strategy management events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific strategy actions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenStrategyCommitOnce } from "./function/event";
 *
 * // Wait for first trailing stop adjustment
 * listenStrategyCommitOnce(
 *   (event) => event.action === "trailing-stop",
 *   (event) => console.log("Trailing stop adjusted:", event.symbol)
 * );
 *
 * // Wait for breakeven on BTCUSDT
 * const cancel = listenStrategyCommitOnce(
 *   (event) => event.action === "breakeven" && event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT moved to breakeven at", event.currentPrice)
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
export function listenStrategyCommitOnce(
  filterFn: (event: StrategyCommitContract) => boolean,
  fn: (event: StrategyCommitContract) => void
) {
  backtest.loggerService.log(LISTEN_STRATEGY_COMMIT_ONCE_METHOD_NAME);

  let disposeFn: Function;

  const wrappedFn = async (event: StrategyCommitContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenStrategyCommit(wrappedFn);
}

/**
 * Subscribes to signal synchronization events with queued async processing.
 * This is an order GATE: a throw from the listener rejects the open/close.
 *
 * Emits when signals are being synchronized (e.g. pending signal being opened/closed).
 *
 * Throw semantics (resolved into IBrokerOrderVerdict, identical to the Broker
 * `onOrderOpenCommit` / `onOrderCloseCommit` channel):
 * - plain Error or OrderTransientError → "transient": the open retries
 *   identity-stably (same signalId, `event.attempt` increments) up to
 *   CC_ORDER_OPEN_RETRY_ATTEMPTS; the close retries up to
 *   CC_ORDER_CLOSE_RETRY_ATTEMPTS, then the engine FORCE-CLOSES its state with the
 *   original closeReason. Exhaustion of either signals a fatal exit (exitEmitter).
 * - OrderRejectedError → "rejected", TERMINAL at once: the open is dropped
 *   without arming the retry; the close is force-closed immediately. No exit signal
 *   (business outcome).
 * - OrderDeletedError here is a userspace protocol violation (it belongs to
 *   the CHECK channel) and intentionally degrades to "transient".
 *
 * @param fn - Callback function to handle sync events. If the function returns a promise, signal processing will wait until it resolves.
 * @returns Unsubscribe function to stop listening
 */
export function listenSync(fn: (event: OrderSyncContract) => void) {
  backtest.loggerService.log(LISTEN_SYNC_METHOD_NAME);

  console.error("listenSync is unwanted cause exchange integration should be implemented in Broker.useBrokerAdapter as an infrastructure domain layer");
  console.error("If you need to implement custom logic on signal open/close, please use signal(), signalBacktest(), signalLive() in addActionSchema handler");
  console.error("If listenSync throws the exchange will not execute the order!");
  console.error("");
  console.error("You have been warned!");

  return syncSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to broker-CONFIRMED order fill events with queued async processing.
 *
 * Post-verdict mirror of the order-sync gate: fires ONLY after that gate
 * resolved into the "confirmed" IBrokerOrderVerdict — the broker adapter acknowledged
 * the order really executed/placed on the exchange. A transient or terminal
 * (OrderRejectedError) gate rejection does NOT fire here, and neither does a
 * FORCE-close performed without broker confirmation.
 *
 * Discriminated exactly like OrderSyncContract:
 * - action "signal-open", type "active" — the position order FILLED;
 * - action "signal-open", type "schedule" — the resting entry order was PLACED;
 * - action "signal-close" — the exit order executed.
 *
 * Live-only: backtest gates short-circuit to "confirmed" without an exchange, so
 * nothing is emitted there.
 *
 * Unlike listenSync this is a NOTIFICATION channel, not a gate: a throw from the
 * listener is swallowed at the emission site (logged + errorEmitter) and cannot
 * affect the already-resolved verdict. Safe for telegram/webhook/audit consumers.
 *
 * @param fn - Callback function to handle confirmed fill events. If the function returns a promise, processing is queued sequentially.
 * @returns Unsubscribe function to stop listening
 */
export function listenOrderFill(fn: (event: OrderFillContract) => void) {
  backtest.loggerService.log(LISTEN_ORDER_FILL_METHOD_NAME);
  return orderFillSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to TERMINAL order rejection events with queued async processing.
 *
 * Post-verdict mirror of the rejection branch: fires ONLY when the onOrderSync gate
 * resolved into the "rejected" verdict — the broker adapter threw OrderRejectedError
 * ("the exchange definitively refused this order, retrying is pointless"). Exactly
 * once per dropped order attempt: an open consumes its signalId (the whipsaw guard
 * blocks re-emission of the same id), a close force-closes with the original
 * closeReason. Transient failures never fire here — they retry silently within the
 * bounded budgets.
 *
 * Live-only: backtest gates short-circuit to "confirmed" without an exchange.
 *
 * Like the fill channel this is a NOTIFICATION channel, not a gate: a throw
 * from the listener is swallowed at the emission site (logged + errorEmitter) and
 * cannot affect the already-resolved verdict. Safe for telegram/webhook/audit
 * consumers.
 *
 * @param fn - Callback function to handle terminal rejection events. If the function returns a promise, processing is queued sequentially.
 * @returns Unsubscribe function to stop listening
 */
export function listenOrderReject(fn: (event: OrderRejectContract) => void) {
  backtest.loggerService.log(LISTEN_ORDER_REJECT_METHOD_NAME);
  return orderRejectSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to post-verdict order-check CONTINUE events with queued async processing.
 *
 * Paired with the order-stop channel: the pre-verdict check channel fires the
 * ping REQUEST before the broker adapter answers; this channel carries the resolved
 * NON-terminal decision — the order is confirmed still open (`event.attempt` 0) or a
 * transient check failure was tolerated (`event.attempt` > 0) and monitoring
 * continues. Emitted on every live tick while the monitored signal survives the
 * check, for both states (`event.type` "active"/"schedule").
 *
 * Live-only: backtest never runs order checks. NOTIFICATION channel, not a gate:
 * a throw from the listener is swallowed at the emission site (logged + errorEmitter)
 * and cannot affect the already-made monitoring decision.
 *
 * @param fn - Callback function to handle continue events. If the function returns a promise, processing is queued sequentially.
 * @returns Unsubscribe function to stop listening
 */
export function listenOrderContinue(fn: (event: OrderContinueContract) => void) {
  backtest.loggerService.log(LISTEN_ORDER_CONTINUE_METHOD_NAME);
  return orderContinueSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to post-verdict order-check STOP events with queued async processing.
 *
 * Paired with the order-continue channel: fires exactly once per monitored signal
 * when the check resolved TERMINALLY — `event.reason` "deleted" (OrderDeletedError:
 * confirmed order-not-found, bypassing the tolerance counter) or "exhausted"
 * (CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive transient failures spent, or the
 * legacy config 0). Emitted right BEFORE the teardown: close "closed" for
 * `event.type` "active", cancel "user" for "schedule". `event.attempt` carries the
 * final failure streak.
 *
 * Live-only: backtest never runs order checks. NOTIFICATION channel, not a gate:
 * a throw from the listener is swallowed at the emission site (logged + errorEmitter)
 * and cannot affect the already-made terminal decision.
 *
 * @param fn - Callback function to handle stop events. If the function returns a promise, processing is queued sequentially.
 * @returns Unsubscribe function to stop listening
 */
export function listenOrderStop(fn: (event: OrderStopContract) => void) {
  backtest.loggerService.log(LISTEN_ORDER_STOP_METHOD_NAME);
  return orderStopSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to order-check ping events with queued async processing.
 * This is the order CHECK channel: it decides whether the order behind the monitored
 * signal is still open on the exchange.
 *
 * Emits on every live tick while a signal is monitored, BEFORE completion evaluation,
 * discriminated by `event.type`: "active" — pending signal (open position), "schedule" —
 * scheduled signal (resting entry order). Backtest never emits this event.
 *
 * Throw semantics (resolved into IBrokerOrderVerdict, identical to the Broker
 * `onOrderActiveCheck` / `onOrderScheduleCheck` channel):
 * - plain Error or OrderTransientError → "transient": the failed check is
 *   TOLERATED (order assumed still open, monitoring continues, `event.attempt`
 *   increments) up to CC_ORDER_CHECK_RETRY_ATTEMPTS CONSECUTIVE failures — a network
 *   blip no longer kills a live position; a successful check resets the streak.
 *   Exhaustion acts terminally (close "closed" / cancel "user") and signals a fatal
 *   exit (exitEmitter).
 * - OrderDeletedError → "deleted", TERMINAL at once, bypassing the tolerance:
 *   the CONFIRMED "order not found by `event.signalId`". A FILLED resting order is
 *   NOT a deleted order — confirm fills via commitActivateScheduled /
 *   commitCreateTakeProfit / commitCreateStopLoss instead.
 * - OrderRejectedError here is a userspace protocol violation (it belongs to
 *   the GATE channel) and intentionally degrades to "transient".
 *
 * @param fn - Callback function to handle check events. If the function returns a promise, signal processing will wait until it resolves.
 * @returns Unsubscribe function to stop listening
 */
export function listenCheck(fn: (event: OrderCheckContract) => void) {
  backtest.loggerService.log(LISTEN_CHECK_METHOD_NAME);

  console.error("listenCheck is unwanted cause exchange integration should be implemented in Broker.useBrokerAdapter as an infrastructure domain layer");
  console.error("If you need to check whether the order is still open on the exchange, please use Broker.useBrokerAdapter with onOrderActiveCheck / onOrderScheduleCheck");
  console.error("If listenCheck throws the framework will close the position with closeReason \"closed\" (type \"active\") or cancel the scheduled signal (type \"schedule\")!");
  console.error("");
  console.error("You have been warned!");

  return syncPendingSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to highest profit events with queued async processing.
 * Emits when a signal reaches a new highest profit level during its lifecycle.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 * Useful for tracking profit milestones and implementing dynamic management logic.
 *
 * @param fn - Callback function to handle highest profit events
 * @return Unsubscribe function to stop listening to events
 */
export function listenHighestProfit(fn: (event: HighestProfitContract) => void) {
  backtest.loggerService.log(LISTEN_HIGHEST_PROFIT_METHOD_NAME);

  const wrappedFn = async (event: HighestProfitContract) => {
    if (
      await backtest.strategyCoreService.hasPendingSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      )
    ) {
      await fn(event);
    }
  };

  return highestProfitSubject.subscribe(queued(wrappedFn));
}

/**
 * Subscribes to filtered highest profit events with one-time execution.
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific profit conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 */
export function listenHighestProfitOnce(
  filterFn: (event: HighestProfitContract) => boolean,
  fn: (event: HighestProfitContract) => void
) {
  backtest.loggerService.log(LISTEN_HIGHEST_PROFIT_ONCE_METHOD_NAME);

  let disposeFn: Function;

  const wrappedFn = async (event: HighestProfitContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenHighestProfit(wrappedFn);
}

/**
 * Subscribes to max drawdown events with queued async processing.
 * Emits when a signal reaches a new maximum drawdown level during its lifecycle.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 * Useful for tracking drawdown milestones and implementing dynamic risk management logic.
 * @param fn - Callback function to handle max drawdown events
 * @return Unsubscribe function to stop listening to events
 */
export function listenMaxDrawdown(fn: (event: MaxDrawdownContract) => void) {
  backtest.loggerService.log(LISTEN_MAX_DRAWDOWN_METHOD_NAME);
  
  const wrappedFn = async (event: MaxDrawdownContract) => {
    if (
      await backtest.strategyCoreService.hasPendingSignal(
        event.backtest,
        event.symbol,
        { 
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      )
    ) {
      await fn(event);
    }
  };

  return maxDrawdownSubject.subscribe(queued(wrappedFn));
}

/**
 * Subscribes to filtered max drawdown events with one-time execution.
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific drawdown conditions.
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @return Unsubscribe function to cancel the listener before it fires
 */
export function listenMaxDrawdownOnce(
  filterFn: (event: MaxDrawdownContract) => boolean,
  fn: (event: MaxDrawdownContract) => void
) {
  backtest.loggerService.log(LISTEN_MAX_DRAWDOWN_ONCE_METHOD_NAME);
  let disposeFn: Function;

  const wrappedFn = async (event: MaxDrawdownContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenMaxDrawdown(wrappedFn);
}

/**
 * Subscribes to worst stale (peak-rollback) events with queued async processing.
 * Emits when the worst giveback from a profit peak recorded for a signal grows to a new record during its lifecycle.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 * Useful for calibrating trailingTake, profitLock, holdMinutes and peak-staleness thresholds from live observations.
 * @param fn - Callback function to handle worst stale events
 * @return Unsubscribe function to stop listening to events
 */
export function listenWorstStale(fn: (event: WorstStaleContract) => void) {
  backtest.loggerService.log(LISTEN_WORST_STALE_METHOD_NAME);

  const wrappedFn = async (event: WorstStaleContract) => {
    if (
      await backtest.strategyCoreService.hasPendingSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      )
    ) {
      await fn(event);
    }
  };

  return worstStaleSubject.subscribe(queued(wrappedFn));
}

/**
 * Subscribes to filtered worst stale events with one-time execution.
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific rollback conditions.
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @return Unsubscribe function to cancel the listener before it fires
 */
export function listenWorstStaleOnce(
  filterFn: (event: WorstStaleContract) => boolean,
  fn: (event: WorstStaleContract) => void
) {
  backtest.loggerService.log(LISTEN_WORST_STALE_ONCE_METHOD_NAME);
  let disposeFn: Function;

  const wrappedFn = async (event: WorstStaleContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenWorstStale(wrappedFn);
}

/**
 * Subscribes to signal info events with queued async processing.
 * Emits when a strategy calls commitSignalInfo() to broadcast a user-defined note for an open position.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 * @param fn - Callback function to handle signal info events
 * @return Unsubscribe function to stop listening to events
 */
export function listenSignalNotify(fn: (event: SignalInfoContract) => void) {
  backtest.loggerService.log(LISTEN_SIGNAL_NOTIFY_METHOD_NAME);

  const wrappedFn = async (event: SignalInfoContract) => {
    if (
      await backtest.strategyCoreService.hasPendingSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      )
    ) {
      await fn(event);
    }
  };

  return signalNotifySubject.subscribe(queued(wrappedFn));
}

/**
 * Subscribes to strategy pause state changes with queued async processing.
 * Emits when setPaused actually flips the pause flag of a strategy (new position
 * opening suspended/resumed; existing signals keep closing normally).
 * Use this to generate user-facing notifications about pause/resume.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle pause state change events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * const unsubscribe = listenPause((event) => {
 *   console.log(`${event.symbol} ${event.strategyName}: ${event.paused ? "paused" : "resumed"}`);
 * });
 * ```
 */
export function listenPause(fn: (event: PauseContract) => void) {
  backtest.loggerService.log(LISTEN_PAUSE_METHOD_NAME);
  return pauseSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered pause state change events with one-time execution.
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes.
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @return Unsubscribe function to cancel the listener before it fires
 */
export function listenPauseOnce(
  filterFn: (event: PauseContract) => boolean,
  fn: (event: PauseContract) => void
) {
  backtest.loggerService.log(LISTEN_PAUSE_ONCE_METHOD_NAME);
  let disposeFn: Function;

  const wrappedFn = async (event: PauseContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenPause(wrappedFn);
}

/**
 * Subscribes to filtered signal info events with one-time execution.
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes.
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @return Unsubscribe function to cancel the listener before it fires
 */
export function listenSignalNotifyOnce(
  filterFn: (event: SignalInfoContract) => boolean,
  fn: (event: SignalInfoContract) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_NOTIFY_ONCE_METHOD_NAME);
  let disposeFn: Function;

  const wrappedFn = async (event: SignalInfoContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenSignalNotify(wrappedFn);
}

/**
 * Subscribes to before start events with queued async processing.
 * Emits when the engine is about to start a new strategy execution for a symbol.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 * @param fn - Callback function to handle before start events
 * @return Unsubscribe function to stop listening to events
 */
export function listenBeforeStart(fn: (event: BeforeStartContract) => void) {
  backtest.loggerService.log(LISTEN_BEFORE_START_METHOD_NAME);
  return beforeStartSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered before start events with one-time execution.
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes.
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @return Unsubscribe function to cancel the listener before it fires
 */
export function listenBeforeStartOnce(
  filterFn: (event: BeforeStartContract) => boolean,
  fn: (event: BeforeStartContract) => void
) {
  backtest.loggerService.log(LISTEN_BEFORE_START_ONCE_METHOD_NAME);
  let disposeFn: Function;

  const wrappedFn = async (event: BeforeStartContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenBeforeStart(wrappedFn);
}

/**
 * Subscribes to after end events with queued async processing.
 * Emits when the engine has completed processing a strategy execution for a symbol.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 * @param fn - Callback function to handle after end events
 * @return Unsubscribe function to stop listening to events
 */
export function listenAfterEnd(fn: (event: AfterEndContract) => void) {
  backtest.loggerService.log(LISTEN_AFTER_END_METHOD_NAME);
  return afterEndSubject.subscribe(queued(async (event) => fn(event)));
}

/**
 * Subscribes to filtered after end events with one-time execution.
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes.
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @return Unsubscribe function to cancel the listener before it fires
 */
export function listenAfterEndOnce(
  filterFn: (event: AfterEndContract) => boolean,
  fn: (event: AfterEndContract) => void
) {
  backtest.loggerService.log(LISTEN_AFTER_END_ONCE_METHOD_NAME);
  let disposeFn: Function;

  const wrappedFn = async (event: AfterEndContract) => {
    if (filterFn(event)) {
      await fn(event);
      disposeFn && disposeFn();
    }
  };

  return disposeFn = listenAfterEnd(wrappedFn);
}

/**
 * ============================================================================
 * PER-SIGNAL LISTENERS
 * ============================================================================
 *
 * Every channel below carries a signal identifier, so it can be collapsed to
 * "fire the callback once per NEW signal that satisfies the condition".
 *
 * Each of these wraps the matching plain `listenX` listener rather than building a
 * private observer chain, exactly like the `listenXOnce` forms do:
 *
 *   listenX(async (event) => {
 *     if (!filterFn(event)) return;   // 1. the condition
 *     if (alreadySeen(event)) return; // 2. collapse repeats
 *     await fn(event);                // 3. deliver
 *   })
 *
 * WHY DELEGATE. The plain listener owns the single `queued()` wrapper, so all three
 * steps run INSIDE that queue, one event at a time. A private
 * `.filter().connect(queued())` chain would put the dedup check OUTSIDE the queue,
 * where it is evaluated at emit time: three events emitted back-to-back would have
 * all three dedup decisions made before the first callback even started, advancing
 * the remembered id before the subscriber had been handed the event it stands for.
 *
 * THE DEDUP STATE IS PER-EXECUTION, NOT GLOBAL. Each subscription owns a
 * `LimitedMap` mapping an execution identity to the last signal id delivered for
 * it:
 *
 *   strategyName:exchangeName[:frameName]:backtest|live:symbol  ->  signalId
 *
 * (frameName is omitted when empty, exactly like the Cache key helper.) An event
 * passes only when the stored id for its own key differs from the incoming one.
 *
 * This is deliberately NOT `Operator.distinct`, which keeps a single "previous
 * compare value" for the whole stream. These subjects are process-global: several
 * strategies, symbols and modes push through them at once and their events
 * interleave. Under `distinct`, execution B's event becomes the baseline and lets
 * execution A's next repeat through as new. A per-key map gives every execution
 * independent state, so interleaving cannot resurrect an already-reported signal.
 *
 * WHAT "ONCE PER SIGNAL" MEANS. One callback per (execution, signal id) pair, for
 * as long as that identity stays in the map. A strategy monitors one signal at a
 * time, so in practice this is exactly one callback per signal - regardless of what
 * other strategies emit in between. The map holds SEEN_MAP_LIMIT identities and
 * evicts oldest-first; an evicted identity reports its current signal once more.
 * Use the plain `listenX` variants when every emission matters, and `listenXOnce`
 * when the subscription should tear itself down after the first hit.
 *
 * Because they delegate, whatever the plain listener checks before delivery applies
 * here too: the partial-profit, partial-loss, breakeven, ping and notify channels
 * still confirm the position is live via `hasPendingSignal` first.
 */

/**
 * Subscribes to signal events, delivering the callback once per new signal id.
 *
 * Filters by the predicate first, then collapses repeats sharing the same execution
 * identity and `event.signal.id`. Idle events carry `signal: null` and are skipped,
 * so the callback always receives an event with a signal attached.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalPerSignal } from "backtest-kit";
 *
 * // Notify once per signal that closed in profit, no matter how many
 * // closed events the channel replays for it
 * const unsubscribe = listenSignalPerSignal(
 *   (event) => event.action === "closed" && event.pnl.pnlPercentage > 0,
 *   (event) => console.log("Profitable close:", event.signal.id)
 * );
 *
 * unsubscribe();
 * ```
 */
export function listenSignalPerSignal(
  filterFn: (event: IStrategyTickResult) => boolean,
  fn: (event: IStrategyTickResult) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: IStrategyTickResult) => {
    if (!event.signal) {
      return;
    }
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.signal.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenSignal(wrappedFn);
}

/**
 * Subscribes to live signal events, delivering the callback once per new signal id.
 *
 * Only receives events from Live.run() execution. Idle events (`signal: null`)
 * are skipped. See the per-signal section header for the dedup semantics.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalLivePerSignal(
  filterFn: (event: IStrategyTickResult) => boolean,
  fn: (event: IStrategyTickResult) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_LIVE_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: IStrategyTickResult) => {
    if (!event.signal) {
      return;
    }
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.signal.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenSignalLive(wrappedFn);
}

/**
 * Subscribes to backtest signal events, delivering the callback once per new signal id.
 *
 * Only receives events from Backtest.run() execution. Idle events (`signal: null`)
 * are skipped. See the per-signal section header for the dedup semantics.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalBacktestPerSignal(
  filterFn: (event: IStrategyTickResult) => boolean,
  fn: (event: IStrategyTickResult) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_BACKTEST_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: IStrategyTickResult) => {
    if (!event.signal) {
      return;
    }
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.signal.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenSignalBacktest(wrappedFn);
}

/**
 * Subscribes to pending lifecycle events, delivering the callback once per new signal id.
 *
 * Deduplicates on `event.data.id`. Note that a single signal legitimately produces
 * both an "opened" and a "closed" event: filter by `action` if only one of the two
 * transitions should reach the callback.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalEventPerSignal } from "backtest-kit";
 *
 * listenSignalEventPerSignal(
 *   (event) => event.action === "opened",
 *   (event) => console.log("New position:", event.data.id, event.data.priceOpen)
 * );
 * ```
 */
export function listenSignalEventPerSignal(
  filterFn: (event: SignalEventContract) => boolean,
  fn: (event: SignalEventContract) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_EVENT_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: SignalEventContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.data.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenSignalEvent(wrappedFn);
}

/**
 * Subscribes to scheduled lifecycle events, delivering the callback once per new signal id.
 *
 * Deduplicates on `event.data.id`. A scheduled signal may emit both "scheduled"
 * and "cancelled": filter by `action` to isolate one transition.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenOrderSchedulePerSignal(
  filterFn: (event: ScheduleEventContract) => boolean,
  fn: (event: ScheduleEventContract) => void
) {
  backtest.loggerService.log(LISTEN_ORDER_SCHEDULE_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: ScheduleEventContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.data.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenOrderSchedule(wrappedFn);
}

/**
 * Subscribes to active ping events, delivering the callback once per new signal id.
 *
 * Active pings fire on every tick of a monitored position, so this is the
 * canonical use of the per-signal form: react the first tick a position meets a
 * condition, then stay silent for the rest of its life.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenActivePingPerSignal } from "backtest-kit";
 *
 * // Alert once per position when it first crosses 5% unrealized profit
 * listenActivePingPerSignal(
 *   (event) => event.data.position === "long" && event.currentPrice > event.data.priceOpen * 1.05,
 *   (event) => console.log("Position up 5%:", event.data.id)
 * );
 * ```
 */
export function listenActivePingPerSignal(
  filterFn: (event: ActivePingContract) => boolean,
  fn: (event: ActivePingContract) => void
) {
  backtest.loggerService.log(LISTEN_ACTIVE_PING_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: ActivePingContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.data.strategyName, event.data.exchangeName];
    if (event.data.frameName) parts.push(event.data.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.data.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenActivePing(wrappedFn);
}

/**
 * Subscribes to schedule ping events, delivering the callback once per new signal id.
 *
 * Schedule pings fire every tick while a resting entry waits for activation;
 * this collapses them to one callback per scheduled signal.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenSchedulePingPerSignal(
  filterFn: (event: SchedulePingContract) => boolean,
  fn: (event: SchedulePingContract) => void
) {
  backtest.loggerService.log(LISTEN_SCHEDULE_PING_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: SchedulePingContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.data.strategyName, event.data.exchangeName];
    if (event.data.frameName) parts.push(event.data.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.data.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenSchedulePing(wrappedFn);
}

/**
 * Subscribes to partial profit level events, delivering the callback once per new signal id.
 *
 * Deduplicates on `event.data.id`, so only the FIRST matching profit level of a
 * signal is reported. To react to each distinct level of the same signal, key on
 * the level instead by using the plain `listenPartialProfitAvailable` form with
 * your own bookkeeping, or narrow `filterFn` to a single level.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenPartialProfitAvailablePerSignal(
  filterFn: (event: PartialProfitContract) => boolean,
  fn: (event: PartialProfitContract) => void
) {
  backtest.loggerService.log(LISTEN_PARTIAL_PROFIT_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: PartialProfitContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.data.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenPartialProfitAvailable(wrappedFn);
}

/**
 * Subscribes to partial loss level events, delivering the callback once per new signal id.
 *
 * Deduplicates on `event.data.id` — only the first matching loss level of a
 * signal reaches the callback. The same per-level caveat as the partial-profit
 * form applies: narrow `filterFn` to a single level if you need each one.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenPartialLossAvailablePerSignal(
  filterFn: (event: PartialLossContract) => boolean,
  fn: (event: PartialLossContract) => void
) {
  backtest.loggerService.log(LISTEN_PARTIAL_LOSS_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: PartialLossContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.data.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenPartialLossAvailable(wrappedFn);
}

/**
 * Subscribes to breakeven events, delivering the callback once per new signal id.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenBreakevenAvailablePerSignal(
  filterFn: (event: BreakevenContract) => boolean,
  fn: (event: BreakevenContract) => void
) {
  backtest.loggerService.log(LISTEN_BREAKEVEN_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: BreakevenContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.data.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenBreakevenAvailable(wrappedFn);
}

/**
 * Subscribes to highest profit events, delivering the callback once per new signal id.
 *
 * Deduplicates on `event.signal.id`. Since this channel re-emits on every new
 * profit peak, the per-signal form reports the first peak that satisfies the
 * predicate and then goes quiet for that signal.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenHighestProfitPerSignal(
  filterFn: (event: HighestProfitContract) => boolean,
  fn: (event: HighestProfitContract) => void
) {
  backtest.loggerService.log(LISTEN_HIGHEST_PROFIT_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: HighestProfitContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.signal.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenHighestProfit(wrappedFn);
}

/**
 * Subscribes to max drawdown events, delivering the callback once per new signal id.
 *
 * Deduplicates on `event.signal.id` — the first drawdown matching the predicate
 * is reported, later deeper drawdowns of the same signal are suppressed.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenMaxDrawdownPerSignal(
  filterFn: (event: MaxDrawdownContract) => boolean,
  fn: (event: MaxDrawdownContract) => void
) {
  backtest.loggerService.log(LISTEN_MAX_DRAWDOWN_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: MaxDrawdownContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.signal.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenMaxDrawdown(wrappedFn);
}

/**
 * Subscribes to worst stale (peak-rollback) events, delivering the callback once per new signal id.
 *
 * Deduplicates on `event.signal.id` — the first rollback matching the predicate
 * is reported, later deeper rollbacks of the same signal are suppressed.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenWorstStalePerSignal(
  filterFn: (event: WorstStaleContract) => boolean,
  fn: (event: WorstStaleContract) => void
) {
  backtest.loggerService.log(LISTEN_WORST_STALE_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: WorstStaleContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.signal.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenWorstStale(wrappedFn);
}

/**
 * Subscribes to signal info events, delivering the callback once per new signal id.
 *
 * Deduplicates on `event.data.id`, so a strategy spamming commitSignalInfo() for
 * the same position notifies the subscriber only once.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 */
export function listenSignalNotifyPerSignal(
  filterFn: (event: SignalInfoContract) => boolean,
  fn: (event: SignalInfoContract) => void
) {
  backtest.loggerService.log(LISTEN_SIGNAL_NOTIFY_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: SignalInfoContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.data.id;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenSignalNotify(wrappedFn);
}

/**
 * Subscribes to strategy management events, delivering the callback once per new signal id.
 *
 * Deduplicates on `event.signalId`. Trailing commits repeat many times per
 * position, so this reports the first commit matching the predicate per signal.
 *
 * @param filterFn - Predicate selecting which events are considered
 * @param fn - Callback invoked once per new signal id
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenStrategyCommitPerSignal } from "backtest-kit";
 *
 * // Report the first trailing-stop adjustment of each position
 * listenStrategyCommitPerSignal(
 *   (event) => event.action === "trailing-stop",
 *   (event) => console.log("First trailing stop for", event.signalId)
 * );
 * ```
 */
export function listenStrategyCommitPerSignal(
  filterFn: (event: StrategyCommitContract) => boolean,
  fn: (event: StrategyCommitContract) => void
) {
  backtest.loggerService.log(LISTEN_STRATEGY_COMMIT_PER_SIGNAL_METHOD_NAME);

  // Last delivered signal id per execution identity. Bounded so a long-lived
  // subscription over many strategies/symbols cannot grow without limit.
  const seenMap = new LimitedMap<string, string>(SEEN_MAP_LIMIT);

  // Delegated to the plain listener on purpose: that one owns the single queued()
  // wrapper, so the dedup decision below runs INSIDE the queue, in step with the
  // callback. Building a private .filter().connect(queued()) chain instead would
  // evaluate every dedup decision up front, at emit time, while earlier callbacks
  // were still pending - advancing the remembered id before the subscriber had
  // actually been handed the event it stands for.
  const wrappedFn = async (event: StrategyCommitContract) => {
    if (!filterFn(event)) {
      return;
    }
    const parts = [event.strategyName, event.exchangeName];
    if (event.frameName) parts.push(event.frameName);
    parts.push(event.backtest ? "backtest" : "live");
    parts.push(event.symbol);
    const key = parts.join(":");
    const signalId = event.signalId;
    if (seenMap.get(key) === signalId) {
      return;
    }
    seenMap.set(key, signalId);
    await fn(event);
  };

  return listenStrategyCommit(wrappedFn);
}
