import { Subject } from "functools-kit";
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
import { WalkerStopContract } from "../contract/WalkerStop.contract";
import { RiskContract } from "../contract/Risk.contract";
import { PingContract } from "../contract/Ping.contract";

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
 * Exit emitter for critical errors that require process termination.
 * Emits errors that should terminate the current execution (Backtest, Live, Walker).
 * Unlike errorEmitter (for recoverable errors), exitEmitter signals fatal errors.
 */
export const exitEmitter = new Subject<Error>();

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
export const progressBacktestEmitter = new Subject<ProgressBacktestContract>();

/**
 * Progress emitter for walker execution progress.
 * Emits progress updates during walker execution.
 */
export const progressWalkerEmitter = new Subject<ProgressWalkerContract>();

/**
 * Progress emitter for optimizer execution progress.
 * Emits progress updates during optimizer execution.
 */
export const progressOptimizerEmitter = new Subject<ProgressOptimizerContract>();

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
export const walkerCompleteSubject = new Subject<WalkerCompleteContract>();

/**
 * Walker stop emitter for walker cancellation events.
 * Emits when a walker comparison is stopped/cancelled.
 *
 * Includes walkerName to support multiple walkers running on the same symbol.
 */
export const walkerStopSubject = new Subject<WalkerStopContract>();

/**
 * Validation emitter for risk validation errors.
 * Emits when risk validation functions throw errors during signal checking.
 */
export const validationSubject = new Subject<Error>();

/**
 * Partial profit emitter for profit level milestones.
 * Emits when a signal reaches a profit level (10%, 20%, 30%, etc).
 */
export const partialProfitSubject = new Subject<PartialProfitContract>();

/**
 * Partial loss emitter for loss level milestones.
 * Emits when a signal reaches a loss level (10%, 20%, 30%, etc).
 */
export const partialLossSubject = new Subject<PartialLossContract>();

/**
 * Breakeven emitter for stop-loss protection milestones.
 * Emits when a signal's stop-loss is moved to breakeven (entry price).
 */
export const breakevenSubject = new Subject<BreakevenContract>();

/**
 * Risk rejection emitter for risk management violations.
 * Emits ONLY when a signal is rejected due to risk validation failure.
 * Does not emit for allowed signals (prevents spam).
 */
export const riskSubject = new Subject<RiskContract>();

/**
 * Ping emitter for scheduled signal monitoring events.
 * Emits every minute when a scheduled signal is being monitored (waiting for activation).
 * Allows users to track scheduled signal lifecycle and implement custom cancellation logic.
 */
export const pingSubject = new Subject<PingContract>();

