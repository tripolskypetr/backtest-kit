import { Subject } from "functools-kit";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";
import { DoneContract } from "../contract/Done.contract";
import { ProgressContract } from "../contract/Progress.contract";
import { PerformanceContract } from "../contract/Performance.contract";
import { WalkerContract } from "../contract/Walker.contract";
import { IWalkerResults, WalkerName } from "../interfaces/Walker.interface";

/**
 * Global signal emitter for all trading events (live + backtest).
 * Emits all signal events regardless of execution mode.
 */
export const signalEmitter = new Subject<IStrategyTickResult>();

/**
 * Live trading signal emitter.
 * Emits only signals from live trading execution.
 */
export const signalLiveEmitter = new Subject<IStrategyTickResult>();

/**
 * Backtest signal emitter.
 * Emits only signals from backtest execution.
 */
export const signalBacktestEmitter = new Subject<IStrategyTickResult>();

/**
 * Error emitter for background execution errors.
 * Emits errors caught in background tasks (Live.background, Backtest.background).
 */
export const errorEmitter = new Subject<Error>();

/**
 * Done emitter for live background execution completion.
 * Emits when live background tasks complete (Live.background).
 */
export const doneLiveSubject = new Subject<DoneContract>();

/**
 * Done emitter for backtest background execution completion.
 * Emits when backtest background tasks complete (Backtest.background).
 */
export const doneBacktestSubject = new Subject<DoneContract>();

/**
 * Done emitter for walker background execution completion.
 * Emits when walker background tasks complete (Walker.background).
 */
export const doneWalkerSubject = new Subject<DoneContract>();

/**
 * Progress emitter for backtest execution progress.
 * Emits progress updates during backtest execution.
 */
export const progressBacktestEmitter = new Subject<ProgressContract>();

/**
 * Performance emitter for execution metrics.
 * Emits performance metrics for profiling and bottleneck detection.
 */
export const performanceEmitter = new Subject<PerformanceContract>();

/**
 * Walker emitter for strategy comparison progress.
 * Emits progress updates during walker execution (each strategy completion).
 */
export const walkerEmitter = new Subject<WalkerContract>();

/**
 * Walker complete emitter for strategy comparison completion.
 * Emits when all strategies have been tested and final results are available.
 */
export const walkerCompleteSubject = new Subject<IWalkerResults>();

/**
 * Walker stop emitter for walker cancellation events.
 * Emits when a walker comparison is stopped/cancelled.
 */
export const walkerStopSubject = new Subject<WalkerName>();

/**
 * Validation emitter for risk validation errors.
 * Emits when risk validation functions throw errors during signal checking.
 */
export const validationSubject = new Subject<Error>();

