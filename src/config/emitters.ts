import { BehaviorSubject, Subject } from "functools-kit";
import { IStrategyTickResult, IStrategyTickResultOpened } from "../interfaces/Strategy.interface";
import { DoneContract } from "../contract/Done.contract";
import { ProgressBacktestContract } from "../contract/ProgressBacktest.contract";
import { ProgressWalkerContract } from "../contract/ProgressWalker.contract";
import { PerformanceContract } from "../contract/Performance.contract";
import { WalkerContract } from "../contract/Walker.contract";
import { WalkerCompleteContract } from "../contract/WalkerComplete.contract";
import { PartialProfitContract } from "../contract/PartialProfit.contract";
import { PartialLossContract } from "../contract/PartialLoss.contract";
import { BreakevenContract } from "../contract/Breakeven.contract";
import { WalkerStopContract } from "../contract/WalkerStop.contract";
import { RiskContract } from "../contract/Risk.contract";
import { SchedulePingContract } from "../contract/SchedulePing.contract";
import { ScheduleEventContract } from "../contract/ScheduleEvent.contract";
import { SignalEventContract } from "../contract/SignalEvent.contract";
import { ActivePingContract } from "../contract/ActivePing.contract";
import { IdlePingContract } from "../contract/IdlePing.contract";
import { StrategyCommitContract } from "../contract/StrategyCommit.contract";
import SignalSyncContract from "../contract/SignalSync.contract";
import SignalPingContract from "../contract/SignalPing.contract";
import { HighestProfitContract } from "../contract/HighestProfit.contract";
import { MaxDrawdownContract } from "../contract/MaxDrawdown.contract";
import { SignalInfoContract } from "../contract/SignalInfo.contract";
import { BeforeStartContract } from "../contract/BeforeStart.contract";
import { AfterEndContract } from "../contract/AfterEnd.contract";

/**
 * Exchange signal synchronization emitter.
 * If listenner throws, it means the signal was not properly synchronized to the exchange (e.g. limit order failed to fill).
 * 
 * The framework will skip position open/close and will try again on the next tick until successful synchronization.
 * This ensures that the framework's internal state remains consistent with the exchange's state.
 * Consumers should implement retry logic in their listeners to handle transient synchronization failures.
 */
export const syncSubject = new Subject<SignalSyncContract>();

/**
 * Pending-order synchronization emitter.
 * Emitted on every live tick while a pending signal is monitored, BEFORE TP/SL/time evaluation.
 * Asks the exchange whether the order is STILL pending (open).
 *
 * If a listener returns false OR throws, the order is treated as no longer open on the exchange
 * and the framework closes the pending signal with closeReason "closed". Never emitted in backtest.
 */
export const syncPendingSubject = new Subject<SignalPingContract>();

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
 * Shutdown emitter for graceful shutdown events.
 * Emits when a shutdown signal is received (e.g., SIGINT) to allow components to perform cleanup before process exit.
 */
export const shutdownEmitter = new Subject<void>();

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
 * Schedule ping emitter for scheduled signal monitoring events.
 * Emits every minute when a scheduled signal is being monitored (waiting for activation).
 * Allows users to track scheduled signal lifecycle and implement custom cancellation logic.
 */
export const schedulePingSubject = new Subject<SchedulePingContract>();

/**
 * Scheduled signal lifecycle emitter (creation and cancellation).
 * Emits when a scheduled signal is created (action "scheduled") or cancelled before
 * activation (action "cancelled": timeout / price_reject / user) during tick()/backtest().
 *
 * The scheduled -> active transition (activation) is intentionally NOT emitted here — that
 * produces an "opened" signal on the regular signal emitters instead.
 */
export const scheduleEventSubject = new Subject<ScheduleEventContract>();

/**
 * Pending signal lifecycle emitter (open and close).
 * Emits when a pending position is opened (action "opened": new signal / immediate / scheduled
 * or user activation) or closed (action "closed" with closeReason take_profit / stop_loss /
 * time_expired / closed) during tick()/backtest().
 */
export const signalEventSubject = new Subject<SignalEventContract>();

/**
 * Active ping emitter for active pending signal monitoring events.
 * Emits every minute when an active pending signal is being monitored.
 * Allows users to track active signal lifecycle and implement custom dynamic management logic.
 */
export const activePingSubject = new Subject<ActivePingContract>();

/**
 * Idle ping emitter for strategy idle state events.
 * Emits every tick when there is no pending or scheduled signal being monitored.
 */
export const idlePingSubject = new Subject<IdlePingContract>();

/**
 * Strategy management signal emitter.
 * Emits when strategy management actions are executed:
 * - cancel-scheduled: Scheduled signal cancelled
 * - close-pending: Pending signal closed
 * - partial-profit: Partial close at profit level
 * - partial-loss: Partial close at loss level
 * - trailing-stop: Stop-loss adjusted
 * - trailing-take: Take-profit adjusted
 * - breakeven: Stop-loss moved to entry price
 *
 * Used by StrategyReportService and StrategyMarkdownService for event logging and reporting.
 */
export const strategyCommitSubject = new Subject<StrategyCommitContract>();

/**
 * ClientStrategy::backtest using return instead of async iterator emitter.
 * If signal was scheduled to open, emits when the signal is actually opened.
 * 
 * Allows to yield IStrategyTickResultOpened in addition to IStrategyTickResultClosed | IStrategyTickResultCancelled for
 * BacktestLogicPrivateService::*run
 */
export const backtestScheduleOpenSubject = new Subject<IStrategyTickResultOpened>();

/**
 * Highest profit emitter for real-time profit tracking.
 * Emits updates on the highest profit achieved for an open position.
 * Allows users to track profit milestones and implement custom management logic based on profit levels.
 */
export const highestProfitSubject = new Subject<HighestProfitContract>();

/**
 * Max drawdown emitter for real-time risk tracking.
 * Emits updates on the maximum drawdown experienced for an open position.
 * Allows users to track drawdown levels and implement custom risk management logic based on drawdown thresholds.
 */
export const maxDrawdownSubject = new Subject<MaxDrawdownContract>();

/**
 * Signal info emitter for user-defined informational notes on open positions.
 * Emits when a strategy calls commitSignalInfo() to broadcast a custom annotation.
 */
export const signalNotifySubject = new Subject<SignalInfoContract>();

/**
 * Before start emitter for strategy initialization events.
 * Emits when the engine is about to start a new strategy execution.
 */
export const beforeStartSubject = new Subject<BeforeStartContract>();

/**
 * After end emitter for strategy completion events.
 * Emits when the engine has completed processing a signal.
 */
export const afterEndSubject = new Subject<AfterEndContract>();

/**
 * Emitter for `@backtest-kit/cli`, which notifies the application
 * that all modules have been initialized.
 * 
 * Send entry absolute path to the consumer
 */
export const entrySubject = new BehaviorSubject<string>();
