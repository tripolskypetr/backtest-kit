import { IStrategyTickResult, StrategyName } from "./Strategy.interface";
import { BreakevenContract } from "../contract/Breakeven.contract";
import { PartialProfitContract } from "../contract/PartialProfit.contract";
import { PartialLossContract } from "../contract/PartialLoss.contract";
import { PingContract } from "../contract/Ping.contract";
import { RiskContract } from "../contract/Risk.contract";
import { FrameName } from "./Frame.interface";
import { ILogger } from "./Logger.interface";

/**
 * Constructor type for action handlers with strategy context.
 *
 * @param strategyName - Strategy identifier (e.g., "rsi_divergence", "macd_cross")
 * @param frameName - Timeframe identifier (e.g., "1m", "5m", "1h")
 * @param backtest - True for backtest mode, false for live trading
 * @returns Partial implementation of IAction (only required handlers)
 *
 * @example
 * ```typescript
 * class TelegramNotifier implements Partial<IAction> {
 *   constructor(
 *     private strategyName: StrategyName,
 *     private frameName: FrameName,
 *     private backtest: boolean
 *   ) {}
 *
 *   signal(event: IStrategyTickResult): void {
 *     if (!this.backtest && event.state === 'opened') {
 *       telegram.send(`[${this.strategyName}/${this.frameName}] New signal`);
 *     }
 *   }
 * }
 *
 * const actionCtors: TActionCtor[] = [TelegramNotifier, ReduxLogger];
 * ```
 */
export type TActionCtor = new (strategyName: StrategyName, frameName: FrameName, backtest: boolean) => Partial<IAction>;

export interface IActionParams extends IActionSchema {
  logger: ILogger;
  strategyName: StrategyName;
  frameName: FrameName;
}

export interface IActionCallbacks {
  onInit(): void | Promise<void>;
  onDispose(): void | Promise<void>;
}

export interface IActionSchema {
  actionName: ActionName;
  handler: TActionCtor;
  callbacks: Partial<IActionCallbacks>;
}

/**
 * Action interface for state manager integration.
 *
 * Provides methods to handle all events emitted by connection services.
 * Each method corresponds to a specific event type emitted via .next() calls.
 *
 * Use this interface to implement custom state management logic:
 * - Redux/Zustand action dispatchers
 * - Event logging systems
 * - Real-time monitoring dashboards
 * - Analytics and metrics collection
 *
 * @example
 * ```typescript
 * class ReduxStateManager implements IAction {
 *   constructor(private store: Store) {}
 *
 *   onSignal(event: IStrategyTickResult): void {
 *     this.store.dispatch({ type: 'SIGNAL', payload: event });
 *   }
 *
 *   onBreakeven(event: BreakevenContract): void {
 *     this.store.dispatch({ type: 'BREAKEVEN', payload: event });
 *   }
 *
 *   // ... implement other methods
 * }
 * ```
 */
export interface IAction {
  /**
   * Handles signal events from all modes (live + backtest).
   *
   * Emitted by: StrategyConnectionService via signalEmitter
   * Source: StrategyConnectionService.tick() and StrategyConnectionService.backtest()
   * Frequency: Every tick/candle when strategy is evaluated
   *
   * @param event - Signal state result (idle, scheduled, opened, active, closed, cancelled)
   */
  signal(event: IStrategyTickResult): void | Promise<void>;

  /**
   * Handles signal events from live trading only.
   *
   * Emitted by: StrategyConnectionService via signalLiveEmitter
   * Source: StrategyConnectionService.tick() when backtest=false
   * Frequency: Every tick in live mode
   *
   * @param event - Signal state result from live trading
   */
  signalLive(event: IStrategyTickResult): void | Promise<void>;

  /**
   * Handles signal events from backtest only.
   *
   * Emitted by: StrategyConnectionService via signalBacktestEmitter
   * Source: StrategyConnectionService.backtest() when backtest=true
   * Frequency: Every candle in backtest mode
   *
   * @param event - Signal state result from backtest
   */
  signalBacktest(event: IStrategyTickResult): void | Promise<void>;

  /**
   * Handles breakeven events when stop-loss is moved to entry price.
   *
   * Emitted by: BreakevenConnectionService via breakevenSubject
   * Source: COMMIT_BREAKEVEN_FN callback in BreakevenConnectionService
   * Frequency: Once per signal when breakeven threshold is reached
   *
   * @param event - Breakeven milestone data
   */
  breakeven(event: BreakevenContract): void | Promise<void>;

  /**
   * Handles partial profit level events (10%, 20%, 30%, etc).
   *
   * Emitted by: PartialConnectionService via partialProfitSubject
   * Source: COMMIT_PROFIT_FN callback in PartialConnectionService
   * Frequency: Once per profit level per signal (deduplicated)
   *
   * @param event - Profit milestone data with level and price
   */
  partialProfit(event: PartialProfitContract): void | Promise<void>;

  /**
   * Handles partial loss level events (-10%, -20%, -30%, etc).
   *
   * Emitted by: PartialConnectionService via partialLossSubject
   * Source: COMMIT_LOSS_FN callback in PartialConnectionService
   * Frequency: Once per loss level per signal (deduplicated)
   *
   * @param event - Loss milestone data with level and price
   */
  partialLoss(event: PartialLossContract): void | Promise<void>;

  /**
   * Handles ping events during scheduled signal monitoring.
   *
   * Emitted by: StrategyConnectionService via pingSubject
   * Source: COMMIT_PING_FN callback in StrategyConnectionService
   * Frequency: Every minute while scheduled signal is waiting for activation
   *
   * @param event - Scheduled signal monitoring data
   */
  ping(event: PingContract): void | Promise<void>;

  /**
   * Handles risk rejection events when signals fail risk validation.
   *
   * Emitted by: RiskConnectionService via riskSubject
   * Source: COMMIT_REJECTION_FN callback in RiskConnectionService
   * Frequency: Only when signal is rejected (not emitted for allowed signals)
   *
   * @param event - Risk rejection data with reason and context
   */
  riskRejection(event: RiskContract): void | Promise<void>;

  /**
   * Cleans up resources and subscriptions when action handler is no longer needed.
   *
   * Called by: Connection services during shutdown
   * Use for: Unsubscribing from observables, closing connections, flushing buffers
   */
  dispose(): void | Promise<void>;
}

/**
 * Unique action identifier.
 */
export type ActionName = string;
