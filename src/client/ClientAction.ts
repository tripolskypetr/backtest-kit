import {
  singleshot,
  getErrorMessage,
  trycatch,
  errorData,
} from "functools-kit";
import {
  IAction,
  IActionParams,
  IPublicAction,
} from "../interfaces/Action.interface";
import { IStrategyTickResult, StrategyName } from "../interfaces/Strategy.interface";
import { BreakevenContract } from "../contract/Breakeven.contract";
import { PartialProfitContract } from "../contract/PartialProfit.contract";
import { PartialLossContract } from "../contract/PartialLoss.contract";
import { SchedulePingContract } from "../contract/SchedulePing.contract";
import { ActivePingContract } from "../contract/ActivePing.contract";
import { RiskContract } from "../contract/Risk.contract";
import backtest from "../lib";
import { errorEmitter } from "../config/emitters";
import { FrameName } from "../interfaces/Frame.interface";

/** Wrapper to call signal callback with error handling */
const CALL_SIGNAL_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    event: IStrategyTickResult,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onSignal) {
      await self.params.callbacks.onSignal(event, self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_SIGNAL_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call signalLive callback with error handling */
const CALL_SIGNAL_LIVE_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    event: IStrategyTickResult,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onSignalLive) {
      await self.params.callbacks.onSignalLive(event, self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_SIGNAL_LIVE_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call signalBacktest callback with error handling */
const CALL_SIGNAL_BACKTEST_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    event: IStrategyTickResult,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onSignalBacktest) {
      await self.params.callbacks.onSignalBacktest(event, self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_SIGNAL_BACKTEST_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call breakeven callback with error handling */
const CALL_BREAKEVEN_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    event: BreakevenContract,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onBreakeven) {
      await self.params.callbacks.onBreakeven(event, self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_BREAKEVEN_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call partialProfit callback with error handling */
const CALL_PARTIAL_PROFIT_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    event: PartialProfitContract,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onPartialProfit) {
      await self.params.callbacks.onPartialProfit(event, self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_PARTIAL_PROFIT_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call partialLoss callback with error handling */
const CALL_PARTIAL_LOSS_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    event: PartialLossContract,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onPartialLoss) {
      await self.params.callbacks.onPartialLoss(event, self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_PARTIAL_LOSS_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call scheduled ping callback with error handling */
const CALL_PING_SCHEDULED_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    event: SchedulePingContract,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onPingScheduled) {
      await self.params.callbacks.onPingScheduled(event, self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_PING_SCHEDULED_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call active ping callback with error handling */
const CALL_PING_ACTIVE_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    event: ActivePingContract,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onPingActive) {
      await self.params.callbacks.onPingActive(event, self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_PING_ACTIVE_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call riskRejection callback with error handling */
const CALL_RISK_REJECTION_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    event: RiskContract,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onRiskRejection) {
      await self.params.callbacks.onRiskRejection(event, self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_RISK_REJECTION_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call onInit callback with error handling */
const CALL_INIT_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onInit) {
      await self.params.callbacks.onInit(self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_INIT_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call onDispose callback with error handling */
const CALL_DISPOSE_CALLBACK_FN = trycatch(
  async (
    self: ClientAction,
    strategyName: StrategyName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    if (self.params.callbacks?.onDispose) {
      await self.params.callbacks.onDispose(self.params.actionName, strategyName, frameName, backtest);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientAction CALL_DISPOSE_CALLBACK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Creates an action handler instance from the provided handler constructor or returns it directly if it's not a function.
 * If the handler is a constructor function, it instantiates it with strategy name, frame name, and action name as arguments.
 * Otherwise, assumes the handler is already an object and returns it as-is.
 * 
 * @param self - The ClientAction instance containing the handler parameters.
 * @returns A partial implementation of IPublicAction representing the handler instance.
 */
const CREATE_HANDLER_FN = (self: ClientAction): Partial<IPublicAction> => {
  if (typeof self.params.handler === "function") {
    return Reflect.construct(self.params.handler, [
      self.params.strategyName,
      self.params.frameName,
      self.params.actionName,
    ]);
  }
  return self.params.handler;
}

/**
 * Initializes action handler instance.
 * Uses singleshot pattern to ensure it only runs once.
 * This function is exported for use in tests or other modules.
 */
export const WAIT_FOR_INIT_FN = async (self: ClientAction): Promise<void> => {
  self.params.logger.debug("ClientAction waitForInit", {
    actionName: self.params.actionName,
    strategyName: self.params.strategyName,
    frameName: self.params.frameName,
  });

  // Create handler instance
  self._handlerInstance = CREATE_HANDLER_FN(self);

  // Call handler init() method if defined
  if (self._handlerInstance?.init) {
    await self._handlerInstance.init();
  }

  // Call onInit callback
  await CALL_INIT_CALLBACK_FN(
    self,
    self.params.strategyName,
    self.params.frameName,
    self.params.backtest
  );
};

/**
 * Disposes action handler instance.
 * Uses singleshot pattern to ensure it only runs once.
 * This function is exported for use in tests or other modules.
 */
export const WAIT_FOR_DISPOSE_FN = async (self: ClientAction): Promise<void> => {
  self.params.logger.debug("ClientAction waitForDispose", {
    actionName: self.params.actionName,
    strategyName: self.params.strategyName,
    frameName: self.params.frameName,
  });

  if (!self._handlerInstance) {
    return;
  }

  // Call handler dispose method if defined
  if (self._handlerInstance?.dispose) {
    await self._handlerInstance.dispose();
  }

  // Call onDispose callback
  await CALL_DISPOSE_CALLBACK_FN(
    self,
    self.params.strategyName,
    self.params.frameName,
    self.params.backtest
  );

  self._handlerInstance = null;
};

/**
 * ClientAction implementation for action handler execution.
 *
 * Provides lifecycle management and event routing for action handlers:
 * - Initializes handler instance with strategy context
 * - Routes events to handler methods and callbacks
 * - Manages disposal and cleanup
 *
 * Action handlers implement custom logic for:
 * - State management (Redux, Zustand, MobX)
 * - Event logging and monitoring
 * - Real-time notifications (Telegram, Discord, email)
 * - Analytics and metrics collection
 *
 * Used internally by strategy execution to integrate action handlers.
 */
export class ClientAction implements IAction {
  /**
   * Handler instance created from params.handler constructor.
   * Starts as null, gets initialized on first use.
   */
  _handlerInstance: Partial<IPublicAction> | null = null;

  /**
   * Creates a new ClientAction instance.
   *
   * @param params - Action parameters including handler, callbacks, and context
   * @param params.actionName - Unique action identifier
   * @param params.handler - Action handler constructor
   * @param params.callbacks - Optional lifecycle and event callbacks
   * @param params.logger - Logger service for debugging
   * @param params.strategyName - Strategy identifier
   * @param params.exchangeName - Exchange identifier
   * @param params.frameName - Timeframe identifier
   * @param params.backtest - Whether running in backtest mode
   *
   * @example
   * ```typescript
   * const actionClient = new ClientAction({
   *   actionName: "telegram-notifier",
   *   handler: TelegramNotifier,
   *   callbacks: {
   *     onInit: async (actionName, strategyName, frameName, backtest) => {
   *       console.log(`Initialized ${actionName} for ${strategyName}/${frameName}`);
   *     },
   *     onSignal: (event, actionName, strategyName, frameName, backtest) => {
   *       console.log(`Signal: ${event.action}`);
   *     }
   *   },
   *   logger: loggerService,
   *   strategyName: "rsi_divergence",
   *   exchangeName: "binance",
   *   frameName: "1h",
   *   backtest: false
   * });
   *
   * await actionClient.signal({
   *   action: 'opened',
   *   signal: { id: '123', side: 'long' },
   *   backtest: false
   * });
   *
   * await actionClient.dispose();
   * ```
   */
  constructor(readonly params: IActionParams) {}

  /**
   * Initializes handler instance using singleshot pattern.
   * Ensures initialization happens exactly once.
   */
  public waitForInit = singleshot(async () => await WAIT_FOR_INIT_FN(this));

  /**
   * Handles signal events from all modes (live + backtest).
   */
  public async signal(event: IStrategyTickResult): Promise<void> {
    this.params.logger.debug("ClientAction signal", {
      actionName: this.params.actionName,
      strategyName: this.params.strategyName,
      frameName: this.params.frameName,
      action: event.action,
    });

    if (!this._handlerInstance) {
      await this.waitForInit();
    }

    // Call handler method if defined
    if (this._handlerInstance?.signal) {
      await this._handlerInstance.signal(event);
    }

    // Call callback if defined
    await CALL_SIGNAL_CALLBACK_FN(
      this,
      event,
      this.params.strategyName,
      this.params.frameName,
      event.backtest
    );
  };

  /**
   * Handles signal events from live trading only.
   */
  public async signalLive(event: IStrategyTickResult): Promise<void> {
    this.params.logger.debug("ClientAction signalLive", {
      actionName: this.params.actionName,
      strategyName: this.params.strategyName,
      frameName: this.params.frameName,
      action: event.action,
    });

    if (!this._handlerInstance) {
      await this.waitForInit();
    }

    // Call handler method if defined
    if (this._handlerInstance?.signalLive) {
      await this._handlerInstance.signalLive(event);
    }

    // Call callback if defined
    await CALL_SIGNAL_LIVE_CALLBACK_FN(
      this,
      event,
      this.params.strategyName,
      this.params.frameName,
      event.backtest
    );
  };

  /**
   * Handles signal events from backtest only.
   */
  public async signalBacktest(event: IStrategyTickResult): Promise<void> {
    this.params.logger.debug("ClientAction signalBacktest", {
      actionName: this.params.actionName,
      strategyName: this.params.strategyName,
      frameName: this.params.frameName,
      action: event.action,
    });

    if (!this._handlerInstance) {
      await this.waitForInit();
    }

    // Call handler method if defined
    if (this._handlerInstance?.signalBacktest) {
      await this._handlerInstance.signalBacktest(event);
    }

    // Call callback if defined
    await CALL_SIGNAL_BACKTEST_CALLBACK_FN(
      this,
      event,
      this.params.strategyName,
      this.params.frameName,
      event.backtest
    );
  };

  /**
   * Handles breakeven events when stop-loss is moved to entry price.
   */
  public async breakeven(event: BreakevenContract): Promise<void> {
    this.params.logger.debug("ClientAction breakeven", {
      actionName: this.params.actionName,
      strategyName: this.params.strategyName,
      frameName: this.params.frameName,
    });

    if (!this._handlerInstance) {
      await this.waitForInit();
    }

    // Call handler method if defined
    if (this._handlerInstance?.breakeven) {
      await this._handlerInstance.breakeven(event);
    }

    // Call callback if defined
    await CALL_BREAKEVEN_CALLBACK_FN(
      this,
      event,
      this.params.strategyName,
      this.params.frameName,
      event.backtest
    );
  };

  /**
   * Handles partial profit level events (10%, 20%, 30%, etc).
   */
  public async partialProfit(event: PartialProfitContract): Promise<void> {
    this.params.logger.debug("ClientAction partialProfit", {
      actionName: this.params.actionName,
      strategyName: this.params.strategyName,
      frameName: this.params.frameName,
    });

    if (!this._handlerInstance) {
      await this.waitForInit();
    }

    // Call handler method if defined
    if (this._handlerInstance?.partialProfit) {
      await this._handlerInstance.partialProfit(event);
    }

    // Call callback if defined
    await CALL_PARTIAL_PROFIT_CALLBACK_FN(
      this,
      event,
      this.params.strategyName,
      this.params.frameName,
      event.backtest
    );
  };

  /**
   * Handles partial loss level events (-10%, -20%, -30%, etc).
   */
  public async partialLoss(event: PartialLossContract): Promise<void> {
    this.params.logger.debug("ClientAction partialLoss", {
      actionName: this.params.actionName,
      strategyName: this.params.strategyName,
      frameName: this.params.frameName,
    });

    if (!this._handlerInstance) {
      await this.waitForInit();
    }

    // Call handler method if defined
    if (this._handlerInstance?.partialLoss) {
      await this._handlerInstance.partialLoss(event);
    }

    // Call callback if defined
    await CALL_PARTIAL_LOSS_CALLBACK_FN(
      this,
      event,
      this.params.strategyName,
      this.params.frameName,
      event.backtest
    );
  };

  /**
   * Handles scheduled ping events during scheduled signal monitoring.
   */
  public async pingScheduled(event: SchedulePingContract): Promise<void> {
    this.params.logger.debug("ClientAction pingScheduled", {
      actionName: this.params.actionName,
      strategyName: this.params.strategyName,
      frameName: this.params.frameName,
    });

    if (!this._handlerInstance) {
      await this.waitForInit();
    }

    // Call handler method if defined
    if (this._handlerInstance?.pingScheduled) {
      await this._handlerInstance.pingScheduled(event);
    }

    // Call callback if defined
    await CALL_PING_SCHEDULED_CALLBACK_FN(
      this,
      event,
      this.params.strategyName,
      this.params.frameName,
      event.backtest
    );
  };

  /**
   * Handles active ping events during active pending signal monitoring.
   */
  public async pingActive(event: ActivePingContract): Promise<void> {
    this.params.logger.debug("ClientAction pingActive", {
      actionName: this.params.actionName,
      strategyName: this.params.strategyName,
      frameName: this.params.frameName,
    });

    if (!this._handlerInstance) {
      await this.waitForInit();
    }

    // Call handler method if defined
    if (this._handlerInstance?.pingActive) {
      await this._handlerInstance.pingActive(event);
    }

    // Call callback if defined
    await CALL_PING_ACTIVE_CALLBACK_FN(
      this,
      event,
      this.params.strategyName,
      this.params.frameName,
      event.backtest
    );
  };

  /**
   * Handles risk rejection events when signals fail risk validation.
   */
  public async riskRejection(event: RiskContract): Promise<void> {
    this.params.logger.debug("ClientAction riskRejection", {
      actionName: this.params.actionName,
      strategyName: this.params.strategyName,
      frameName: this.params.frameName,
    });

    if (!this._handlerInstance) {
      await this.waitForInit();
    }

    // Call handler method if defined
    if (this._handlerInstance?.riskRejection) {
      await this._handlerInstance.riskRejection(event);
    }

    // Call callback if defined
    await CALL_RISK_REJECTION_CALLBACK_FN(
      this,
      event,
      this.params.strategyName,
      this.params.frameName,
      event.backtest
    );
  };

  /**
   * Cleans up resources and subscriptions when action handler is no longer needed.
   * Uses singleshot pattern to ensure cleanup happens exactly once.
   */
  public dispose = singleshot(async (): Promise<void> => {
    await WAIT_FOR_DISPOSE_FN(this);
  });
}

export default ClientAction;
