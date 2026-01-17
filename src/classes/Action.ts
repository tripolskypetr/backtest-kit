import BreakevenContract from "../contract/Breakeven.contract";
import PartialLossContract from "../contract/PartialLoss.contract";
import PartialProfitContract from "../contract/PartialProfit.contract";
import SchedulePingContract from "../contract/SchedulePing.contract";
import ActivePingContract from "../contract/ActivePing.contract";
import RiskContract from "../contract/Risk.contract";
import {
  IStrategyTickResult,
  StrategyName,
} from "../interfaces/Strategy.interface";
import { ActionName, IPublicAction } from "../interfaces/Action.interface";
import { FrameName } from "../interfaces/Frame.interface";
import backtest from "../lib";
import { makeExtendable } from "functools-kit";

const METHOD_NAME_INIT = "ActionBase.init";
const METHOD_NAME_EVENT = "ActionBase.event";
const METHOD_NAME_SIGNAL_LIVE = "ActionBase.signalLive";
const METHOD_NAME_SIGNAL_BACKTEST = "ActionBase.signalBacktest";
const METHOD_NAME_BREAKEVEN_AVAILABLE = "ActionBase.breakevenAvailable";
const METHOD_NAME_PARTIAL_PROFIT_AVAILABLE = "ActionBase.partialProfitAvailable";
const METHOD_NAME_PARTIAL_LOSS_AVAILABLE = "ActionBase.partialLossAvailable";
const METHOD_NAME_PING_SCHEDULED = "ActionBase.pingScheduled";
const METHOD_NAME_PING_ACTIVE = "ActionBase.pingActive";
const METHOD_NAME_RISK_REJECTION = "ActionBase.riskRejection";
const METHOD_NAME_DISPOSE = "ActionBase.dispose";

const DEFAULT_SOURCE = "default";

/**
 * Base class for custom action handlers.
 *
 * Provides default implementations for all IPublicAction methods that log events.
 * Extend this class to implement custom action handlers for:
 * - State management (Redux, Zustand, MobX)
 * - Real-time notifications (Telegram, Discord, Email)
 * - Event logging and monitoring
 * - Analytics and metrics collection
 * - Custom business logic triggers
 *
 * Key features:
 * - All methods have default implementations (no need to implement unused methods)
 * - Automatic logging of all events via backtest.loggerService
 * - Access to strategy context (strategyName, frameName, actionName)
 * - Implements full IPublicAction interface
 *
 * Lifecycle:
 * 1. Constructor called with (strategyName, frameName, actionName)
 * 2. init() called once for async initialization
 * 3. Event methods called as strategy executes (signal, breakeven, partialProfit, etc.)
 * 4. dispose() called once for cleanup
 *
 * Event flow:
 * - signal() - Called on every tick/candle (all modes)
 * - signalLive() - Called only in live mode
 * - signalBacktest() - Called only in backtest mode
 * - breakevenAvailable() - Called when SL moved to entry
 * - partialProfitAvailable() - Called on profit milestones (10%, 20%, etc.)
 * - partialLossAvailable() - Called on loss milestones (-10%, -20%, etc.)
 * - pingScheduled() - Called every minute during scheduled signal monitoring
 * - pingActive() - Called every minute during active pending signal monitoring
 * - riskRejection() - Called when signal rejected by risk management
 *
 * @example
 * ```typescript
 * import { ActionBase } from "backtest-kit";
 *
 * // Extend ActionBase and override only needed methods
 * class TelegramNotifier extends ActionBase {
 *   private bot: TelegramBot | null = null;
 *
 *   async init() {
 *     super.init(); // Call parent for logging
 *     this.bot = new TelegramBot(process.env.TELEGRAM_TOKEN);
 *     await this.bot.connect();
 *   }
 *
 *   async signal(event: IStrategyTickResult) {
 *     super.signal(event); // Call parent for logging
 *     if (event.action === 'opened') {
 *       await this.bot.send(
 *         `[${this.strategyName}/${this.frameName}] Signal opened: ${event.signal.side}`
 *       );
 *     }
 *   }
 *
 *   async breakeven(event: BreakevenContract) {
 *     super.breakeven(event); // Call parent for logging
 *     await this.bot.send(
 *       `[${this.strategyName}] Breakeven reached at ${event.currentPrice}`
 *     );
 *   }
 *
 *   async dispose() {
 *     super.dispose(); // Call parent for logging
 *     await this.bot?.disconnect();
 *     this.bot = null;
 *   }
 * }
 *
 * // Register the action
 * addActionSchema({
 *   actionName: "telegram-notifier",
 *   handler: TelegramNotifier
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Redux state management example
 * class ReduxAction extends ActionBase {
 *   constructor(
 *     strategyName: StrategyName,
 *     frameName: FrameName,
 *     actionName: ActionName,
 *     private store: Store
 *   ) {
 *     super(strategyName, frameName, actionName);
 *   }
 *
 *   signal(event: IStrategyTickResult) {
 *     this.store.dispatch({
 *       type: 'STRATEGY_SIGNAL',
 *       payload: { event, strategyName: this.strategyName, frameName: this.frameName }
 *     });
 *   }
 *
 *   partialProfit(event: PartialProfitContract) {
 *     this.store.dispatch({
 *       type: 'PARTIAL_PROFIT',
 *       payload: { event, strategyName: this.strategyName }
 *     });
 *   }
 * }
 * ```
 */
class ActionBase implements IPublicAction {
  /**
   * Creates a new ActionBase instance.
   *
   * @param strategyName - Strategy identifier this action is attached to
   * @param frameName - Timeframe identifier this action is attached to
   * @param actionName - Action identifier
   * @param backtest - If running in backtest
   */
  constructor(
    public readonly strategyName: StrategyName,
    public readonly frameName: FrameName,
    public readonly actionName: ActionName,
    public readonly backtest: boolean
  ) {}

  /**
   * Initializes the action handler.
   *
   * Called once after construction. Override to perform async initialization:
   * - Establish database connections
   * - Initialize API clients
   * - Load configuration files
   * - Open file handles or network sockets
   *
   * Default implementation: Logs initialization event.
   *
   * @example
   * ```typescript
   * async init() {
   *   super.init(); // Keep parent logging
   *   this.db = await connectToDatabase();
   *   this.telegram = new TelegramBot(process.env.TOKEN);
   * }
   * ```
   */
  public init(source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_INIT, {
      source,
    });
  }

  /**
   * Handles signal events from all modes (live + backtest).
   *
   * Called every tick/candle when strategy is evaluated.
   * Receives all signal states: idle, scheduled, opened, active, closed, cancelled.
   *
   * Triggered by: ActionCoreService.signal() via StrategyConnectionService
   * Source: signalEmitter.next() in tick() and backtest() methods
   * Frequency: Every tick/candle
   *
   * Default implementation: Logs signal event.
   *
   * @param event - Signal state result with action, state, signal data, and context
   *
   * @example
   * ```typescript
   * signal(event: IStrategyTickResult) {
   *   if (event.action === 'opened') {
   *     console.log(`Signal opened: ${event.signal.side} at ${event.signal.priceOpen}`);
   *   }
   *   if (event.action === 'closed') {
   *     console.log(`Signal closed: PNL ${event.signal.revenue}%`);
   *   }
   * }
   * ```
   */
  public signal(event: IStrategyTickResult, source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_EVENT, {
      event,
      source,
    });
  }

  /**
   * Handles signal events from live trading only.
   *
   * Called every tick in live mode.
   * Use for actions that should only run in production (e.g., sending real notifications).
   *
   * Triggered by: ActionCoreService.signalLive() via StrategyConnectionService
   * Source: signalLiveEmitter.next() in tick() and backtest() methods when backtest=false
   * Frequency: Every tick in live mode
   *
   * Default implementation: Logs live signal event.
   *
   * @param event - Signal state result from live trading
   *
   * @example
   * ```typescript
   * async signalLive(event: IStrategyTickResult) {
   *   if (event.action === 'opened') {
   *     await this.telegram.send('Real trade opened!');
   *     await this.placeRealOrder(event.signal);
   *   }
   * }
   * ```
   */
  public signalLive(event: IStrategyTickResult, source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_SIGNAL_LIVE, {
      event,
      source,
    });
  }

  /**
   * Handles signal events from backtest only.
   *
   * Called every candle in backtest mode.
   * Use for actions specific to backtesting (e.g., collecting test metrics).
   *
   * Triggered by: ActionCoreService.signalBacktest() via StrategyConnectionService
   * Source: signalBacktestEmitter.next() in tick() and backtest() methods when backtest=true
   * Frequency: Every candle in backtest mode
   *
   * Default implementation: Logs backtest signal event.
   *
   * @param event - Signal state result from backtest
   *
   * @example
   * ```typescript
   * signalBacktest(event: IStrategyTickResult) {
   *   if (event.action === 'closed') {
   *     this.backtestMetrics.recordTrade(event.signal);
   *   }
   * }
   * ```
   */
  public signalBacktest(event: IStrategyTickResult, source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_SIGNAL_BACKTEST, {
      event,
      source,
    });
  }

  /**
   * Handles breakeven events when stop-loss is moved to entry price.
   *
   * Called once per signal when price moves far enough to cover fees and slippage.
   * Breakeven threshold: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2 + CC_BREAKEVEN_THRESHOLD
   *
   * Triggered by: ActionCoreService.breakevenAvailable() via BreakevenConnectionService
   * Source: breakevenSubject.next() in CREATE_COMMIT_BREAKEVEN_FN callback
   * Frequency: Once per signal when threshold reached
   *
   * Default implementation: Logs breakeven event.
   *
   * @param event - Breakeven milestone data with signal info, current price, timestamp
   *
   * @example
   * ```typescript
   * async breakevenAvailable(event: BreakevenContract) {
   *   await this.telegram.send(
   *     `[${event.strategyName}] Breakeven reached! ` +
   *     `Signal: ${event.data.side} @ ${event.currentPrice}`
   *   );
   * }
   * ```
   */
  public breakevenAvailable(event: BreakevenContract, source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_BREAKEVEN_AVAILABLE, {
      event,
      source,
    });
  }

  /**
   * Handles partial profit level events (10%, 20%, 30%, etc).
   *
   * Called once per profit level per signal (deduplicated).
   * Use to track profit milestones and adjust position management.
   *
   * Triggered by: ActionCoreService.partialProfitAvailable() via PartialConnectionService
   * Source: partialProfitSubject.next() in CREATE_COMMIT_PROFIT_FN callback
   * Frequency: Once per profit level per signal
   *
   * Default implementation: Logs partial profit event.
   *
   * @param event - Profit milestone data with signal info, level (10, 20, 30...), price, timestamp
   *
   * @example
   * ```typescript
   * async partialProfitAvailable(event: PartialProfitContract) {
   *   await this.telegram.send(
   *     `[${event.strategyName}] Profit ${event.level}% reached! ` +
   *     `Current price: ${event.currentPrice}`
   *   );
   *   // Optionally tighten stop-loss or take partial profit
   * }
   * ```
   */
  public partialProfitAvailable(event: PartialProfitContract, source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_PARTIAL_PROFIT_AVAILABLE, {
      event,
      source,
    });
  }

  /**
   * Handles partial loss level events (-10%, -20%, -30%, etc).
   *
   * Called once per loss level per signal (deduplicated).
   * Use to track loss milestones and implement risk management actions.
   *
   * Triggered by: ActionCoreService.partialLossAvailable() via PartialConnectionService
   * Source: partialLossSubject.next() in CREATE_COMMIT_LOSS_FN callback
   * Frequency: Once per loss level per signal
   *
   * Default implementation: Logs partial loss event.
   *
   * @param event - Loss milestone data with signal info, level (-10, -20, -30...), price, timestamp
   *
   * @example
   * ```typescript
   * async partialLossAvailable(event: PartialLossContract) {
   *   await this.telegram.send(
   *     `[${event.strategyName}] Loss ${event.level}% reached! ` +
   *     `Current price: ${event.currentPrice}`
   *   );
   *   // Optionally adjust risk management
   * }
   * ```
   */
  public partialLossAvailable(event: PartialLossContract, source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_PARTIAL_LOSS_AVAILABLE, {
      event,
      source,
    });
  }

  /**
   * Handles scheduled ping events during scheduled signal monitoring.
   *
   * Called every minute while a scheduled signal is waiting for activation.
   * Use to monitor pending signals and track wait time.
   *
   * Triggered by: ActionCoreService.pingScheduled() via StrategyConnectionService
   * Source: schedulePingSubject.next() in CREATE_COMMIT_SCHEDULE_PING_FN callback
   * Frequency: Every minute while scheduled signal is waiting
   *
   * Default implementation: Logs scheduled ping event.
   *
   * @param event - Scheduled signal monitoring data with symbol, strategy info, signal data, timestamp
   *
   * @example
   * ```typescript
   * pingScheduled(event: SchedulePingContract) {
   *   const waitTime = Date.now() - event.data.timestampScheduled;
   *   const waitMinutes = Math.floor(waitTime / 60000);
   *   console.log(`Scheduled signal waiting ${waitMinutes} minutes`);
   * }
   * ```
   */
  public pingScheduled(event: SchedulePingContract, source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_PING_SCHEDULED, {
      event,
      source,
    });
  }

  /**
   * Handles active ping events during active pending signal monitoring.
   *
   * Called every minute while a pending signal is active (position open).
   * Use to monitor active positions and track lifecycle.
   *
   * Triggered by: ActionCoreService.pingActive() via StrategyConnectionService
   * Source: activePingSubject.next() in CREATE_COMMIT_ACTIVE_PING_FN callback
   * Frequency: Every minute while pending signal is active
   *
   * Default implementation: Logs active ping event.
   *
   * @param event - Active pending signal monitoring data with symbol, strategy info, signal data, timestamp
   *
   * @example
   * ```typescript
   * pingActive(event: ActivePingContract) {
   *   const holdTime = Date.now() - event.data.pendingAt;
   *   const holdMinutes = Math.floor(holdTime / 60000);
   *   console.log(`Active signal holding ${holdMinutes} minutes`);
   * }
   * ```
   */
  public pingActive(event: ActivePingContract, source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_PING_ACTIVE, {
      event,
      source,
    });
  }

  /**
   * Handles risk rejection events when signals fail risk validation.
   *
   * Called only when signal is rejected (not emitted for allowed signals).
   * Use to track rejected signals and analyze risk management effectiveness.
   *
   * Triggered by: ActionCoreService.riskRejection() via RiskConnectionService
   * Source: riskSubject.next() in CREATE_COMMIT_REJECTION_FN callback
   * Frequency: Only when signal fails risk validation
   *
   * Default implementation: Logs risk rejection event.
   *
   * @param event - Risk rejection data with symbol, pending signal, rejection reason, timestamp
   *
   * @example
   * ```typescript
   * async riskRejection(event: RiskContract) {
   *   await this.telegram.send(
   *     `[${event.strategyName}] Signal rejected!\n` +
   *     `Reason: ${event.rejectionNote}\n` +
   *     `Active positions: ${event.activePositionCount}`
   *   );
   *   this.metrics.recordRejection(event.rejectionId);
   * }
   * ```
   */
  public riskRejection(event: RiskContract, source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_RISK_REJECTION, {
      event,
      source,
    });
  }

  /**
   * Cleans up resources and subscriptions when action handler is disposed.
   *
   * Called once when strategy execution ends.
   * Guaranteed to run exactly once via singleshot pattern.
   *
   * Override to:
   * - Close database connections
   * - Disconnect from external services
   * - Flush buffers
   * - Save state to disk
   * - Unsubscribe from observables
   *
   * Default implementation: Logs dispose event.
   *
   * @example
   * ```typescript
   * async dispose() {
   *   super.dispose(); // Keep parent logging
   *   await this.db?.disconnect();
   *   await this.telegram?.close();
   *   await this.cache?.quit();
   *   console.log('Action disposed successfully');
   * }
   * ```
   */
  public dispose(source = DEFAULT_SOURCE): void | Promise<void> {
    backtest.loggerService.info(METHOD_NAME_DISPOSE, {
      source,
    });
  }
}

// @ts-ignore
ActionBase = makeExtendable(ActionBase);

export { ActionBase }
