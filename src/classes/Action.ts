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
import {
  ActionName,
  IPublicAction,
} from "../interfaces/Action.interface";
import { FrameName } from "../interfaces/Frame.interface";
import backtest from "../lib";
import { makeExtendable, trycatch, errorData, getErrorMessage } from "functools-kit";
import { errorEmitter } from "../config/emitters";

const METHOD_NAME_INIT = "ActionBase.init";
const METHOD_NAME_EVENT = "ActionBase.event";
const METHOD_NAME_SIGNAL_LIVE = "ActionBase.signalLive";
const METHOD_NAME_SIGNAL_BACKTEST = "ActionBase.signalBacktest";
const METHOD_NAME_BREAKEVEN_AVAILABLE = "ActionBase.breakevenAvailable";
const METHOD_NAME_PARTIAL_PROFIT_AVAILABLE =
  "ActionBase.partialProfitAvailable";
const METHOD_NAME_PARTIAL_LOSS_AVAILABLE = "ActionBase.partialLossAvailable";
const METHOD_NAME_PING_SCHEDULED = "ActionBase.pingScheduled";
const METHOD_NAME_PING_ACTIVE = "ActionBase.pingActive";
const METHOD_NAME_RISK_REJECTION = "ActionBase.riskRejection";
const METHOD_NAME_DISPOSE = "ActionBase.dispose";

const DEFAULT_SOURCE = "default";

/**
 * Proxy wrapper for user-defined action handlers with automatic error handling.
 *
 * Wraps all IPublicAction methods with trycatch to prevent user code errors from crashing the system.
 * All errors are logged, sent to errorEmitter, and returned as null (non-breaking).
 *
 * Key features:
 * - Automatic error catching and logging for all action methods
 * - Safe execution of partial user implementations (missing methods return null)
 * - Consistent error handling across all action lifecycle events
 * - Non-breaking failure mode (errors logged but execution continues)
 *
 * Architecture:
 * - Private constructor enforces factory pattern via fromInstance()
 * - Each method checks if target implements the method before calling
 * - Errors caught with fallback handler (warn log + errorEmitter)
 * - Returns null on error to prevent undefined behavior
 *
 * Used by:
 * - ClientAction to wrap user-provided action handlers
 * - ActionCoreService to safely invoke action callbacks
 *
 * @example
 * ```typescript
 * // Create proxy from user implementation
 * const userAction = {
 *   signal: async (event) => {
 *     // User code that might throw
 *     throw new Error('User error');
 *   }
 * };
 *
 * const proxy = ActionProxy.fromInstance(userAction);
 *
 * // Error is caught and logged, execution continues
 * await proxy.signal(event); // Logs error, returns null
 * await proxy.dispose(); // Safe call even though not implemented
 * ```
 *
 * @example
 * ```typescript
 * // Partial implementation is safe
 * const partialAction = {
 *   init: async () => console.log('Initialized'),
 *   // Other methods not implemented
 * };
 *
 * const proxy = ActionProxy.fromInstance(partialAction);
 * await proxy.init(); // Works
 * await proxy.signal(event); // Returns null (not implemented)
 * ```
 */
class ActionProxy implements IPublicAction {
  /**
   * Creates a new ActionProxy instance.
   *
   * @param _target - Partial action implementation to wrap with error handling
   * @private Use ActionProxy.fromInstance() instead
   */
  private constructor(readonly _target: Partial<IPublicAction>) {}

  /**
   * Initializes the action handler with error handling.
   *
   * Wraps the user's init() method in trycatch to prevent initialization errors from crashing the system.
   * If the target doesn't implement init(), this method safely returns undefined.
   *
   * @returns Promise resolving to user's init() result or undefined if not implemented
   */
  public init = trycatch(
    async () => {
      if (this._target.init) {
        return await this._target.init();
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.init thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Handles signal events from all modes with error handling.
   *
   * Wraps the user's signal() method to catch and log any errors.
   * Called on every tick/candle when strategy is evaluated.
   *
   * @param event - Signal state result with action, state, signal data, and context
   * @returns Promise resolving to user's signal() result or null on error
   */
  public signal = trycatch(
    async (event: IStrategyTickResult) => {
      if (this._target.signal) {
        return await this._target.signal(event);
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.signal thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Handles signal events from live trading only with error handling.
   *
   * Wraps the user's signalLive() method to catch and log any errors.
   * Called every tick in live mode.
   *
   * @param event - Signal state result from live trading
   * @returns Promise resolving to user's signalLive() result or null on error
   */
  public signalLive = trycatch(
    async (event: IStrategyTickResult) => {
      if (this._target.signalLive) {
        return await this._target.signalLive(event);
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.signalLive thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Handles signal events from backtest only with error handling.
   *
   * Wraps the user's signalBacktest() method to catch and log any errors.
   * Called every candle in backtest mode.
   *
   * @param event - Signal state result from backtest
   * @returns Promise resolving to user's signalBacktest() result or null on error
   */
  public signalBacktest = trycatch(
    async (event: IStrategyTickResult) => {
      if (this._target.signalBacktest) {
        return await this._target.signalBacktest(event);
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.signalBacktest thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Handles breakeven events with error handling.
   *
   * Wraps the user's breakevenAvailable() method to catch and log any errors.
   * Called once per signal when stop-loss is moved to entry price.
   *
   * @param event - Breakeven milestone data with signal info, current price, timestamp
   * @returns Promise resolving to user's breakevenAvailable() result or null on error
   */
  public breakevenAvailable = trycatch(
    async (event: BreakevenContract) => {
      if (this._target.breakevenAvailable) {
        return await this._target.breakevenAvailable(event);
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.breakevenAvailable thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Handles partial profit level events with error handling.
   *
   * Wraps the user's partialProfitAvailable() method to catch and log any errors.
   * Called once per profit level per signal (10%, 20%, 30%, etc).
   *
   * @param event - Profit milestone data with signal info, level, price, timestamp
   * @returns Promise resolving to user's partialProfitAvailable() result or null on error
   */
  public partialProfitAvailable = trycatch(
    async (event: PartialProfitContract) => {
      if (this._target.partialProfitAvailable) {
        return await this._target.partialProfitAvailable(event);
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.partialProfitAvailable thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Handles partial loss level events with error handling.
   *
   * Wraps the user's partialLossAvailable() method to catch and log any errors.
   * Called once per loss level per signal (-10%, -20%, -30%, etc).
   *
   * @param event - Loss milestone data with signal info, level, price, timestamp
   * @returns Promise resolving to user's partialLossAvailable() result or null on error
   */
  public partialLossAvailable = trycatch(
    async (event: PartialLossContract) => {
      if (this._target.partialLossAvailable) {
        return await this._target.partialLossAvailable(event);
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.partialLossAvailable thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Handles scheduled ping events with error handling.
   *
   * Wraps the user's pingScheduled() method to catch and log any errors.
   * Called every minute while a scheduled signal is waiting for activation.
   *
   * @param event - Scheduled signal monitoring data with symbol, strategy info, signal data, timestamp
   * @returns Promise resolving to user's pingScheduled() result or null on error
   */
  public pingScheduled = trycatch(
    async (event: SchedulePingContract) => {
      if (this._target.pingScheduled) {
        return await this._target.pingScheduled(event);
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.pingScheduled thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Handles active ping events with error handling.
   *
   * Wraps the user's pingActive() method to catch and log any errors.
   * Called every minute while a pending signal is active (position open).
   *
   * @param event - Active pending signal monitoring data with symbol, strategy info, signal data, timestamp
   * @returns Promise resolving to user's pingActive() result or null on error
   */
  public pingActive = trycatch(
    async (event: ActivePingContract) => {
      if (this._target.pingActive) {
        return await this._target.pingActive(event);
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.pingActive thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Handles risk rejection events with error handling.
   *
   * Wraps the user's riskRejection() method to catch and log any errors.
   * Called only when signal is rejected by risk management validation.
   *
   * @param event - Risk rejection data with symbol, pending signal, rejection reason, timestamp
   * @returns Promise resolving to user's riskRejection() result or null on error
   */
  public riskRejection = trycatch(
    async (event: RiskContract) => {
      if (this._target.riskRejection) {
        return await this._target.riskRejection(event);
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.riskRejection thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );
  /**
   * Cleans up resources with error handling.
   *
   * Wraps the user's dispose() method to catch and log any errors.
   * Called once when strategy execution ends.
   *
   * @returns Promise resolving to user's dispose() result or null on error
   */
  public dispose = trycatch(
    async () => {
      if (this._target.dispose) {
        return await this._target.dispose();
      }
    },
    {
      fallback: (error) => {
        const message = "ActionProxy.dispose thrown";
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        backtest.loggerService.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
      },
      defaultValue: null,
    },
  );

  /**
   * Creates a new ActionProxy instance wrapping a user-provided action handler.
   *
   * Factory method enforcing the private constructor pattern.
   * Wraps all methods of the provided instance with error handling.
   *
   * @param instance - Partial action implementation to wrap
   * @returns New ActionProxy instance with error-safe method wrappers
   *
   * @example
   * ```typescript
   * const userAction = {
   *   signal: async (event) => {
   *     console.log('Signal received:', event);
   *   },
   *   dispose: async () => {
   *     console.log('Cleanup complete');
   *   }
   * };
   *
   * const proxy = ActionProxy.fromInstance(userAction);
   * ```
   */
  public static fromInstance = (instance: Partial<IPublicAction>) => {
    return new ActionProxy(instance);
  };
}

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
    public readonly backtest: boolean,
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
  public signal(
    event: IStrategyTickResult,
    source = DEFAULT_SOURCE,
  ): void | Promise<void> {
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
  public signalLive(
    event: IStrategyTickResult,
    source = DEFAULT_SOURCE,
  ): void | Promise<void> {
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
  public signalBacktest(
    event: IStrategyTickResult,
    source = DEFAULT_SOURCE,
  ): void | Promise<void> {
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
  public breakevenAvailable(
    event: BreakevenContract,
    source = DEFAULT_SOURCE,
  ): void | Promise<void> {
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
  public partialProfitAvailable(
    event: PartialProfitContract,
    source = DEFAULT_SOURCE,
  ): void | Promise<void> {
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
  public partialLossAvailable(
    event: PartialLossContract,
    source = DEFAULT_SOURCE,
  ): void | Promise<void> {
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
  public pingScheduled(
    event: SchedulePingContract,
    source = DEFAULT_SOURCE,
  ): void | Promise<void> {
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
  public pingActive(
    event: ActivePingContract,
    source = DEFAULT_SOURCE,
  ): void | Promise<void> {
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
  public riskRejection(
    event: RiskContract,
    source = DEFAULT_SOURCE,
  ): void | Promise<void> {
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

export { ActionBase, ActionProxy };
