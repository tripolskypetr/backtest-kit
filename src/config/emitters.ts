import { Subject } from "functools-kit";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";
import { DoneContract } from "../contract/Done.contract";
import { ProgressContract } from "../contract/Progress.contract";
import { PerformanceContract } from "../contract/Performance.contract";
import { WalkerContract } from "../contract/Walker.contract";

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
 * Done emitter for background execution completion.
 * Emits when background tasks complete (Live.background, Backtest.background).
 */
export const doneEmitter = new Subject<DoneContract>();

/**
 * Progress emitter for backtest execution progress.
 * Emits progress updates during backtest execution.
 */
export const progressEmitter = new Subject<ProgressContract>();

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

