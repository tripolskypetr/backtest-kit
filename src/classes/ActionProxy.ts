import BreakevenContract from "../contract/Breakeven.contract";
import PartialLossContract from "../contract/PartialLoss.contract";
import PartialProfitContract from "../contract/PartialProfit.contract";
import SchedulePingContract from "../contract/SchedulePing.contract";
import ActivePingContract from "../contract/ActivePing.contract";
import IdlePingContract from "../contract/IdlePing.contract";
import RiskContract from "../contract/Risk.contract";
import { SignalSyncContract } from "../contract/SignalSync.contract";
import LoggerService from "../lib/services/base/LoggerService";
import {
  IStrategyTickResult,
} from "../interfaces/Strategy.interface";
import {
    IActionParams,
  IPublicAction,
} from "../interfaces/Action.interface";
import { trycatch, errorData, getErrorMessage, not } from "functools-kit";
import { errorEmitter } from "../config/emitters";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

/**
 * Wrapper to call init method with error capture.
 */
const CALL_INIT_FN = trycatch(
  async (self: ActionProxy): Promise<void> => {
    if (self._target.init) {
      return await self._target.init();
    }
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.init thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call signal method with error capture.
 */
const CALL_SIGNAL_FN = trycatch(
  async (event: IStrategyTickResult, self: ActionProxy): Promise<void> => {
    if (self._target.signal) {
      return await self._target.signal(event);
    }
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.signal thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call signalLive method with error capture.
 */
const CALL_SIGNAL_LIVE_FN = trycatch(
  async (event: IStrategyTickResult, self: ActionProxy): Promise<void> => {
    if (self._target.signalLive) {
      return await self._target.signalLive(event);
    }
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.signalLive thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call signalBacktest method with error capture.
 */
const CALL_SIGNAL_BACKTEST_FN = trycatch(
  async (event: IStrategyTickResult, self: ActionProxy): Promise<void> => {
    if (self._target.signalBacktest) {
      return await self._target.signalBacktest(event);
    }
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.signalBacktest thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call breakevenAvailable method with error capture.
 */
const CALL_BREAKEVEN_AVAILABLE_FN = trycatch(
  async (event: BreakevenContract, self: ActionProxy): Promise<void> => {
    if (!self._target.breakevenAvailable) {
      return;
    }
    if (
      await not(
        self.params.strategy.hasPendingSignal(
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
      return;
    }
    return await self._target.breakevenAvailable(event);
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.breakevenAvailable thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call partialProfitAvailable method with error capture.
 */
const CALL_PARTIAL_PROFIT_AVAILABLE_FN = trycatch(
  async (event: PartialProfitContract, self: ActionProxy): Promise<void> => {
    if (!self._target.partialProfitAvailable) {
      return;
    }
    if (
      await not(
        self.params.strategy.hasPendingSignal(
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
      return;
    }
    return await self._target.partialProfitAvailable(event);
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.partialProfitAvailable thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call partialLossAvailable method with error capture.
 */
const CALL_PARTIAL_LOSS_AVAILABLE_FN = trycatch(
  async (event: PartialLossContract, self: ActionProxy): Promise<void> => {
    if (!self._target.partialLossAvailable) {
      return;
    }
    if (
      await not(
        self.params.strategy.hasPendingSignal(
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
      return;
    }
    return await self._target.partialLossAvailable(event);
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.partialLossAvailable thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call pingScheduled method with error capture.
 */
const CALL_PING_SCHEDULED_FN = trycatch(
  async (event: SchedulePingContract, self: ActionProxy): Promise<void> => {
    if (!self._target.pingScheduled) {
      return;
    }
    if (
      await not(
        self.params.strategy.hasScheduledSignal(
          event.backtest,
          event.symbol,
          {
            strategyName: event.data.strategyName,
            exchangeName: event.data.exchangeName,
            frameName: event.data.frameName,
          },
        )
      )
    ) {
      return;
    }
    return await self._target.pingScheduled(event);
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.pingScheduled thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call pingIdle method with error capture.
 */
const CALL_PING_IDLE_FN = trycatch(
  async (event: IdlePingContract, self: ActionProxy): Promise<void> => {
    if (!self._target.pingIdle) {
      return;
    }
    if (
      await self.params.strategy.hasPendingSignal(
        event.backtest,
        event.symbol,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      )
    ) {
      return;
    }
    return await self._target.pingIdle(event);
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.pingIdle thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call pingActive method with error capture.
 */
const CALL_PING_ACTIVE_FN = trycatch(
  async (event: ActivePingContract, self: ActionProxy): Promise<void> => {
    if (!self._target.pingActive) {
      return;
    }
    if (
      await not(
        self.params.strategy.hasPendingSignal(
          event.backtest,
          event.symbol,
          {
            strategyName: event.data.strategyName,
            exchangeName: event.data.exchangeName,
            frameName: event.data.frameName,
          },
        )
      )
    ) {
      return;
    }
    return await self._target.pingActive(event);
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.pingActive thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call riskRejection method with error capture.
 */
const CALL_RISK_REJECTION_FN = trycatch(
  async (event: RiskContract, self: ActionProxy): Promise<void> => {
    if (self._target.riskRejection) {
      return await self._target.riskRejection(event);
    }
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.riskRejection thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Wrapper to call dispose method with error capture.
 */
const CALL_DISPOSE_FN = trycatch(
  async (self: ActionProxy): Promise<void> => {
    if (self._target.dispose) {
      return await self._target.dispose();
    }
  },
  {
    fallback: (error) => {
      const message = "ActionProxy.dispose thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Proxy wrapper for user-defined action handlers with automatic error capture.
 *
 * Wraps all IPublicAction methods with trycatch to prevent user code errors from crashing the system.
 * All errors are logged, sent to errorEmitter, and returned as null (non-breaking).
 *
 * Key features:
 * - Automatic error catching and logging for all action methods
 * - Safe execution of partial user implementations (missing methods return null)
 * - Consistent error capture across all action lifecycle events
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
export class ActionProxy implements IPublicAction {
  /**
   * Creates a new ActionProxy instance.
   *
   * @param _target - Partial action implementation to wrap with error capture
   * @private Use ActionProxy.fromInstance() instead
   */
  private constructor(
    readonly _target: Partial<IPublicAction>,
    readonly params: IActionParams
  ) {}

  /**
   * Initializes the action handler with error capture.
   *
   * Wraps the user's init() method in trycatch to prevent initialization errors from crashing the system.
   * If the target doesn't implement init(), this method safely returns undefined.
   *
   * @returns Promise resolving to user's init() result or undefined if not implemented
   */
  public async init() {
    return await CALL_INIT_FN(this);
  }

  /**
   * Handles signal events from all modes with error capture.
   *
   * Wraps the user's signal() method to catch and log any errors.
   * Called on every tick/candle when strategy is evaluated.
   *
   * @param event - Signal state result with action, state, signal data, and context
   * @returns Promise resolving to user's signal() result or null on error
   */
  public async signal(event: IStrategyTickResult) {
    return await CALL_SIGNAL_FN(event, this);
  }

  /**
   * Handles signal events from live trading only with error capture.
   *
   * Wraps the user's signalLive() method to catch and log any errors.
   * Called every tick in live mode.
   *
   * @param event - Signal state result from live trading
   * @returns Promise resolving to user's signalLive() result or null on error
   */
  public async signalLive(event: IStrategyTickResult) {
    return await CALL_SIGNAL_LIVE_FN(event, this);
  }

  /**
   * Handles signal events from backtest only with error capture.
   *
   * Wraps the user's signalBacktest() method to catch and log any errors.
   * Called every candle in backtest mode.
   *
   * @param event - Signal state result from backtest
   * @returns Promise resolving to user's signalBacktest() result or null on error
   */
  public async signalBacktest(event: IStrategyTickResult) {
    return await CALL_SIGNAL_BACKTEST_FN(event, this);
  }

  /**
   * Handles breakeven events with error capture.
   *
   * Wraps the user's breakevenAvailable() method to catch and log any errors.
   * Called once per signal when stop-loss is moved to entry price.
   *
   * @param event - Breakeven milestone data with signal info, current price, timestamp
   * @returns Promise resolving to user's breakevenAvailable() result or null on error
   */
  public async breakevenAvailable(event: BreakevenContract) {
    return await CALL_BREAKEVEN_AVAILABLE_FN(event, this);
  }

  /**
   * Handles partial profit level events with error capture.
   *
   * Wraps the user's partialProfitAvailable() method to catch and log any errors.
   * Called once per profit level per signal (10%, 20%, 30%, etc).
   *
   * @param event - Profit milestone data with signal info, level, price, timestamp
   * @returns Promise resolving to user's partialProfitAvailable() result or null on error
   */
  public async partialProfitAvailable(event: PartialProfitContract) {
    return await CALL_PARTIAL_PROFIT_AVAILABLE_FN(event, this);
  }

  /**
   * Handles partial loss level events with error capture.
   *
   * Wraps the user's partialLossAvailable() method to catch and log any errors.
   * Called once per loss level per signal (-10%, -20%, -30%, etc).
   *
   * @param event - Loss milestone data with signal info, level, price, timestamp
   * @returns Promise resolving to user's partialLossAvailable() result or null on error
   */
  public async partialLossAvailable(event: PartialLossContract) {
    return await CALL_PARTIAL_LOSS_AVAILABLE_FN(event, this);
  }

  /**
   * Handles scheduled ping events with error capture.
   *
   * Wraps the user's pingScheduled() method to catch and log any errors.
   * Called every minute while a scheduled signal is waiting for activation.
   *
   * @param event - Scheduled signal monitoring data with symbol, strategy info, signal data, timestamp
   * @returns Promise resolving to user's pingScheduled() result or null on error
   */
  public async pingScheduled(event: SchedulePingContract) {
    return await CALL_PING_SCHEDULED_FN(event, this);
  }

  /**
   * Handles active ping events with error capture.
   *
   * Wraps the user's pingActive() method to catch and log any errors.
   * Called every minute while a pending signal is active (position open).
   *
   * @param event - Active pending signal monitoring data with symbol, strategy info, signal data, timestamp
   * @returns Promise resolving to user's pingActive() result or null on error
   */
  public async pingActive(event: ActivePingContract) {
    return await CALL_PING_ACTIVE_FN(event, this);
  }

  /**
   * Handles idle ping events with error capture.
   *
   * Wraps the user's pingIdle() method to catch and log any errors.
   * Called every tick while no signal is pending or scheduled.
   *
   * @param event - Idle ping data with symbol, strategy info, current price, timestamp
   * @returns Promise resolving to user's pingIdle() result or null on error
   */
  public async pingIdle(event: IdlePingContract) {
    return await CALL_PING_IDLE_FN(event, this);
  }

  /**
   * Handles risk rejection events with error capture.
   *
   * Wraps the user's riskRejection() method to catch and log any errors.
   * Called only when signal is rejected by risk management validation.
   *
   * @param event - Risk rejection data with symbol, pending signal, rejection reason, timestamp
   * @returns Promise resolving to user's riskRejection() result or null on error
   */
  public async riskRejection(event: RiskContract) {
    return await CALL_RISK_REJECTION_FN(event, this);
  }

  /**
   * Gate for position open/close via limit order.
   * NOT wrapped in trycatch — exceptions propagate to CREATE_SYNC_FN.
   *
   * @param event - Sync event with action "signal-open" or "signal-close"
   */
  public async signalSync(event: SignalSyncContract): Promise<void> {
    if (this._target.signalSync) {
      console.error("Action::signalSync is unwanted cause exchange integration should be implemented in Broker.useBrokerAdapter as an infrastructure domain layer");
      console.error("If you need to implement custom logic on signal open/close, please use signal(), signalBacktest(), signalLive()");
      console.error("If Action::signalSync throws the exchange will not execute the order!");
      console.error("");
      console.error("You have been warned!");
      await this._target.signalSync(event);
    }
  }

  /**
   * Cleans up resources with error capture.
   *
   * Wraps the user's dispose() method to catch and log any errors.
   * Called once when strategy execution ends.
   *
   * @returns Promise resolving to user's dispose() result or null on error
   */
  public async dispose() {
    return await CALL_DISPOSE_FN(this);
  }

  /**
   * Creates a new ActionProxy instance wrapping a user-provided action handler.
   *
   * Factory method enforcing the private constructor pattern.
   * Wraps all methods of the provided instance with error capture.
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
  public static fromInstance(instance: Partial<IPublicAction>, params: IActionParams) {
    return new ActionProxy(instance, params);
  };
}
