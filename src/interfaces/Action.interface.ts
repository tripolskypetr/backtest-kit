import { IStrategyTickResult, StrategyName } from "./Strategy.interface";
import { BreakevenContract } from "../contract/Breakeven.contract";
import { PartialProfitContract } from "../contract/PartialProfit.contract";
import { PartialLossContract } from "../contract/PartialLoss.contract";
import { SchedulePingContract } from "../contract/SchedulePing.contract";
import { ActivePingContract } from "../contract/ActivePing.contract";
import { RiskContract } from "../contract/Risk.contract";
import { FrameName } from "./Frame.interface";
import { ILogger } from "./Logger.interface";
import { ExchangeName } from "./Exchange.interface";

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
export type TActionCtor = new (strategyName: StrategyName, frameName: FrameName, actionName: ActionName) => Partial<IPublicAction>;

/**
 * Action parameters passed to ClientAction constructor.
 * Combines schema with runtime dependencies and execution context.
 *
 * Extended from IActionSchema with:
 * - Logger instance for debugging and monitoring
 * - Strategy context (strategyName, frameName)
 * - Runtime environment flags
 *
 * @example
 * ```typescript
 * const params: IActionParams = {
 *   actionName: "telegram-notifier",
 *   handler: TelegramNotifier,
 *   callbacks: { onInit, onDispose, onSignal },
 *   logger: loggerService,
 *   strategyName: "rsi_divergence",
 *   frameName: "1h"
 * };
 *
 * const actionClient = new ClientAction(params);
 * ```
 */
export interface IActionParams extends IActionSchema {
  /** Logger service for debugging and monitoring action execution */
  logger: ILogger;
  /** Strategy identifier this action is attached to */
  strategyName: StrategyName;
  /** Exchange name (e.g., "binance") */
  exchangeName: ExchangeName;
  /** Timeframe identifier this action is attached to */
  frameName: FrameName;
  /** Whether running in backtest mode */
  backtest: boolean;
}

/**
 * Lifecycle and event callbacks for action handlers.
 *
 * Provides hooks for initialization, disposal, and event handling.
 * All callbacks are optional and support both sync and async execution.
 *
 * Use cases:
 * - Resource initialization (database connections, file handles)
 * - Resource cleanup (close connections, flush buffers)
 * - Event logging and monitoring
 * - State persistence
 *
 * @example
 * ```typescript
 * const callbacks: IActionCallbacks = {
 *   onInit: async (strategyName, frameName, backtest) => {
 *     console.log(`[${strategyName}/${frameName}] Action initialized (backtest=${backtest})`);
 *     await db.connect();
 *   },
 *   onSignal: (event, strategyName, frameName, backtest) => {
 *     if (event.action === 'opened') {
 *       console.log(`New signal opened: ${event.signal.id}`);
 *     }
 *   },
 *   onDispose: async (strategyName, frameName, backtest) => {
 *     await db.disconnect();
 *     console.log(`[${strategyName}/${frameName}] Action disposed`);
 *   }
 * };
 * ```
 */
export interface IActionCallbacks {
  /**
   * Called when action handler is initialized.
   *
   * Use for:
   * - Opening database connections
   * - Initializing external services
   * - Loading persisted state
   * - Setting up subscriptions
   *
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - True for backtest mode, false for live trading
   */
  onInit(actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called when action handler is disposed.
   *
   * Use for:
   * - Closing database connections
   * - Flushing buffers
   * - Saving state to disk
   * - Unsubscribing from observables
   *
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - True for backtest mode, false for live trading
   */
  onDispose(actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called on signal events from all modes (live + backtest).
   *
   * Triggered by: StrategyConnectionService via signalEmitter
   * Frequency: Every tick/candle when strategy is evaluated
   *
   * @param event - Signal state result (idle, scheduled, opened, active, closed, cancelled)
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - True for backtest mode, false for live trading
   */
  onSignal(event: IStrategyTickResult, actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called on signal events from live trading only.
   *
   * Triggered by: StrategyConnectionService via signalLiveEmitter
   * Frequency: Every tick in live mode
   *
   * @param event - Signal state result from live trading
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - Always false (live mode only)
   */
  onSignalLive(event: IStrategyTickResult, actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called on signal events from backtest only.
   *
   * Triggered by: StrategyConnectionService via signalBacktestEmitter
   * Frequency: Every candle in backtest mode
   *
   * @param event - Signal state result from backtest
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - Always true (backtest mode only)
   */
  onSignalBacktest(event: IStrategyTickResult, actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called when breakeven is triggered (stop-loss moved to entry price).
   *
   * Triggered by: BreakevenConnectionService via breakevenSubject
   * Frequency: Once per signal when breakeven threshold is reached
   *
   * @param event - Breakeven milestone data
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - True for backtest mode, false for live trading
   */
  onBreakeven(event: BreakevenContract, actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called when partial profit level is reached (10%, 20%, 30%, etc).
   *
   * Triggered by: PartialConnectionService via partialProfitSubject
   * Frequency: Once per profit level per signal (deduplicated)
   *
   * @param event - Profit milestone data with level and price
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - True for backtest mode, false for live trading
   */
  onPartialProfit(event: PartialProfitContract, actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called when partial loss level is reached (-10%, -20%, -30%, etc).
   *
   * Triggered by: PartialConnectionService via partialLossSubject
   * Frequency: Once per loss level per signal (deduplicated)
   *
   * @param event - Loss milestone data with level and price
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - True for backtest mode, false for live trading
   */
  onPartialLoss(event: PartialLossContract, actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called during scheduled signal monitoring (every minute while waiting for activation).
   *
   * Triggered by: StrategyConnectionService via schedulePingSubject
   * Frequency: Every minute while scheduled signal is waiting
   *
   * @param event - Scheduled signal monitoring data
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - True for backtest mode, false for live trading
   */
  onPingScheduled(event: SchedulePingContract, actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called during active pending signal monitoring (every minute while position is active).
   *
   * Triggered by: StrategyConnectionService via activePingSubject
   * Frequency: Every minute while pending signal is active
   *
   * @param event - Active pending signal monitoring data
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - True for backtest mode, false for live trading
   */
  onPingActive(event: ActivePingContract, actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;

  /**
   * Called when signal is rejected by risk management.
   *
   * Triggered by: RiskConnectionService via riskSubject
   * Frequency: Only when signal fails risk validation (not emitted for allowed signals)
   *
   * @param event - Risk rejection data with reason and context
   * @param actionName - Action identifier
   * @param strategyName - Strategy identifier
   * @param frameName - Timeframe identifier
   * @param backtest - True for backtest mode, false for live trading
   */
  onRiskRejection(event: RiskContract, actionName: ActionName, strategyName: StrategyName, frameName: FrameName, backtest: boolean): void | Promise<void>;
}

/**
 * Action schema registered via addAction().
 * Defines event handler implementation and lifecycle callbacks for state management integration.
 *
 * Actions provide a way to attach custom event handlers to strategies for:
 * - State management (Redux, Zustand, MobX)
 * - Event logging and monitoring
 * - Real-time notifications (Telegram, Discord, email)
 * - Analytics and metrics collection
 * - Custom business logic triggers
 *
 * Each action instance is created per strategy-frame pair and receives all events
 * emitted during strategy execution. Multiple actions can be attached to a single strategy.
 *
 * @example
 * ```typescript
 * import { addAction } from "backtest-kit";
 *
 * // Define action handler class
 * class TelegramNotifier implements Partial<IAction> {
 *   constructor(
 *     private strategyName: StrategyName,
 *     private frameName: FrameName,
 *     private backtest: boolean
 *   ) {}
 *
 *   signal(event: IStrategyTickResult): void {
 *     if (!this.backtest && event.action === 'opened') {
 *       telegram.send(`[${this.strategyName}/${this.frameName}] New signal`);
 *     }
 *   }
 *
 *   dispose(): void {
 *     telegram.close();
 *   }
 * }
 *
 * // Register action schema
 * addAction({
 *   actionName: "telegram-notifier",
 *   handler: TelegramNotifier,
 *   callbacks: {
 *     onInit: async (strategyName, frameName, backtest) => {
 *       console.log(`Telegram notifier initialized for ${strategyName}/${frameName}`);
 *     },
 *     onSignal: (event, strategyName, frameName, backtest) => {
 *       console.log(`Signal event: ${event.action}`);
 *     }
 *   }
 * });
 * ```
 */
export interface IActionSchema {
  /** Unique action identifier for registration */
  actionName: ActionName;
  /** Action handler constructor (instantiated per strategy-frame pair) */
  handler: TActionCtor | Partial<IPublicAction>;
  /** Optional lifecycle and event callbacks */
  callbacks?: Partial<IActionCallbacks>;
}

/**
 * Public action interface for custom action handler implementations.
 *
 * Extends IAction with an initialization lifecycle method.
 * Action handlers implement this interface to receive strategy events and perform custom logic.
 *
 * Lifecycle:
 * 1. Constructor called with (strategyName, frameName, actionName)
 * 2. init() called once for async initialization (setup connections, load resources)
 * 3. Event methods called as strategy executes (signal, breakeven, partialProfit, etc.)
 * 4. dispose() called once for cleanup (close connections, flush buffers)
 *
 * Key features:
 * - init() for async initialization (database connections, API clients, file handles)
 * - All IAction methods available for event handling
 * - dispose() guaranteed to run exactly once via singleshot pattern
 *
 * Common use cases:
 * - State management: Redux/Zustand store integration
 * - Notifications: Telegram/Discord/Email alerts
 * - Logging: Custom event tracking and monitoring
 * - Analytics: Metrics collection and reporting
 * - External systems: Database writes, API calls, file operations
 *
 * @example
 * ```typescript
 * class TelegramNotifier implements Partial<IPublicAction> {
 *   private bot: TelegramBot | null = null;
 *
 *   constructor(
 *     private strategyName: string,
 *     private frameName: string,
 *     private actionName: string
 *   ) {}
 *
 *   // Called once during initialization
 *   async init() {
 *     this.bot = new TelegramBot(process.env.TELEGRAM_TOKEN);
 *     await this.bot.connect();
 *   }
 *
 *   // Called on every signal event
 *   async signal(event: IStrategyTickResult) {
 *     if (event.action === 'opened') {
 *       await this.bot.send(
 *         `[${this.strategyName}/${this.frameName}] Signal opened: ${event.signal.side}`
 *       );
 *     }
 *   }
 *
 *   // Called once during cleanup
 *   async dispose() {
 *     await this.bot?.disconnect();
 *     this.bot = null;
 *   }
 * }
 * ```
 *
 * @see IAction for all available event methods
 * @see TActionCtor for constructor signature requirements
 * @see ClientAction for internal wrapper that manages lifecycle
 */
export interface IPublicAction extends IAction {
  /**
   * Async initialization method called once after construction.
   *
   * Use this method to:
   * - Establish database connections
   * - Initialize API clients
   * - Load configuration files
   * - Open file handles or network sockets
   * - Perform any async setup required before handling events
   *
   * Guaranteed to:
   * - Run exactly once per action handler instance
   * - Complete before any event methods are called
   * - Run after constructor but before first event
   *
   * @returns Promise that resolves when initialization is complete
   * @throws Error if initialization fails (will prevent strategy execution)
   *
   * @example
   * ```typescript
   * async init() {
   *   this.db = await connectToDatabase();
   *   this.cache = new Redis(process.env.REDIS_URL);
   *   await this.cache.connect();
   *   console.log('Action initialized');
   * }
   * ```
   */
  init(): void | Promise<void>;
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
 *   signal(event: IStrategyTickResult): void {
 *     this.store.dispatch({ type: 'SIGNAL', payload: event });
 *   }
 *
 *   breakeven(event: BreakevenContract): void {
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
   * Handles scheduled ping events during scheduled signal monitoring.
   *
   * Emitted by: StrategyConnectionService via schedulePingSubject
   * Source: CREATE_COMMIT_SCHEDULE_PING_FN callback in StrategyConnectionService
   * Frequency: Every minute while scheduled signal is waiting for activation
   *
   * @param event - Scheduled signal monitoring data
   */
  pingScheduled(event: SchedulePingContract): void | Promise<void>;

  /**
   * Handles active ping events during active pending signal monitoring.
   *
   * Emitted by: StrategyConnectionService via activePingSubject
   * Source: CREATE_COMMIT_ACTIVE_PING_FN callback in StrategyConnectionService
   * Frequency: Every minute while pending signal is active
   *
   * @param event - Active pending signal monitoring data
   */
  pingActive(event: ActivePingContract): void | Promise<void>;

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
