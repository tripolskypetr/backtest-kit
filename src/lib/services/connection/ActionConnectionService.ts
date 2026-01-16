import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { ActionName, IAction } from "../../../interfaces/Action.interface";
import { memoize } from "functools-kit";
import ClientAction from "../../../client/ClientAction";
import ActionSchemaService from "../schema/ActionSchemaService";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { IStrategyTickResult } from "../../../interfaces/Strategy.interface";
import { BreakevenContract } from "../../../contract/Breakeven.contract";
import { PartialProfitContract } from "../../../contract/PartialProfit.contract";
import { PartialLossContract } from "../../../contract/PartialLoss.contract";
import { PingContract } from "../../../contract/Ping.contract";
import { RiskContract } from "../../../contract/Risk.contract";

/**
 * Creates a unique key for memoizing ClientAction instances.
 * Key format: "actionName:strategyName:exchangeName:frameName:backtest" or "actionName:strategyName:exchangeName:live"
 * @param actionName - Name of the action schema
 * @param strategyName - Strategy name
 * @param exchangeName - Exchange name
 * @param frameName - Frame name (empty string for live)
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  actionName: ActionName,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): string => {
  const parts = [actionName, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Type definition for action methods.
 * Maps all keys of IAction to any type.
 * Used for dynamic method routing in ActionConnectionService.
 */
type TAction = {
  [key in keyof IAction]: any;
}

/**
 * Connection service routing action operations to correct ClientAction instance.
 *
 * Routes action calls to the appropriate action implementation
 * based on the provided actionName parameter. Uses memoization to cache
 * ClientAction instances for performance.
 *
 * Key features:
 * - Explicit action routing via actionName parameter
 * - Memoized ClientAction instances by actionName, strategyName, frameName
 * - Event routing to action handlers
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * await actionConnectionService.signal(
 *   event,
 *   {
 *     actionName: "telegram-notifier",
 *     strategyName: "rsi_divergence",
 *     exchangeName: "binance",
 *     frameName: "1h",
 *     backtest: false
 *   }
 * );
 * ```
 */
export class ActionConnectionService implements TAction {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly actionSchemaService = inject<ActionSchemaService>(
    TYPES.actionSchemaService
  );

  /**
   * Retrieves memoized ClientAction instance for given action name, strategy, exchange, frame and backtest mode.
   *
   * Creates ClientAction on first call, returns cached instance on subsequent calls.
   * Cache key includes strategyName, exchangeName and frameName to isolate action per strategy-frame pair.
   *
   * @param actionName - Name of registered action schema
   * @param strategyName - Strategy name
   * @param exchangeName - Exchange name
   * @param frameName - Frame name (empty string for live)
   * @param backtest - True if backtest mode, false if live mode
   * @returns Configured ClientAction instance
   */
  public getAction = memoize(
    ([actionName, strategyName, exchangeName, frameName, backtest]) =>
      CREATE_KEY_FN(actionName, strategyName, exchangeName, frameName, backtest),
    (actionName: ActionName, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => {
      const schema = this.actionSchemaService.get(actionName);
      return new ClientAction({
        ...schema,
        logger: this.loggerService,
        exchangeName,
        strategyName,
        frameName,
        backtest,
      });
    }
  );

  /**
   * Routes signal event to appropriate ClientAction instance.
   *
   * @param event - Signal event data
   * @param backtest - Whether running in backtest mode
   * @param context - Execution context with action name, strategy name, exchange name, frame name
   */
  public signal = async (
    event: IStrategyTickResult,
    backtest: boolean,
    context: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionConnectionService signal", {
      action: event.action,
      backtest,
      context,
    });
    await this.getAction(context.actionName, context.strategyName, context.exchangeName, context.frameName, backtest).signal(event);
  };

  /**
   * Routes signalLive event to appropriate ClientAction instance.
   *
   * @param event - Signal event data from live trading
   * @param backtest - Whether running in backtest mode
   * @param context - Execution context with action name, strategy name, exchange name, frame name
   */
  public signalLive = async (
    event: IStrategyTickResult,
    backtest: boolean,
    context: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionConnectionService signalLive", {
      action: event.action,
      backtest,
      context,
    });
    await this.getAction(context.actionName, context.strategyName, context.exchangeName, context.frameName, backtest).signalLive(event);
  };

  /**
   * Routes signalBacktest event to appropriate ClientAction instance.
   *
   * @param event - Signal event data from backtest
   * @param backtest - Whether running in backtest mode
   * @param context - Execution context with action name, strategy name, exchange name, frame name
   */
  public signalBacktest = async (
    event: IStrategyTickResult,
    backtest: boolean,
    context: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionConnectionService signalBacktest", {
      action: event.action,
      backtest,
      context,
    });
    await this.getAction(context.actionName, context.strategyName, context.exchangeName, context.frameName, backtest).signalBacktest(event);
  };

  /**
   * Routes breakeven event to appropriate ClientAction instance.
   *
   * @param event - Breakeven event data
   * @param backtest - Whether running in backtest mode
   * @param context - Execution context with action name, strategy name, exchange name, frame name
   */
  public breakeven = async (
    event: BreakevenContract,
    backtest: boolean,
    context: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionConnectionService breakeven", {
      backtest,
      context,
    });
    await this.getAction(context.actionName, context.strategyName, context.exchangeName, context.frameName, backtest).breakeven(event);
  };

  /**
   * Routes partialProfit event to appropriate ClientAction instance.
   *
   * @param event - Partial profit event data
   * @param backtest - Whether running in backtest mode
   * @param context - Execution context with action name, strategy name, exchange name, frame name
   */
  public partialProfit = async (
    event: PartialProfitContract,
    backtest: boolean,
    context: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionConnectionService partialProfit", {
      backtest,
      context,
    });
    await this.getAction(context.actionName, context.strategyName, context.exchangeName, context.frameName, backtest).partialProfit(event);
  };

  /**
   * Routes partialLoss event to appropriate ClientAction instance.
   *
   * @param event - Partial loss event data
   * @param backtest - Whether running in backtest mode
   * @param context - Execution context with action name, strategy name, exchange name, frame name
   */
  public partialLoss = async (
    event: PartialLossContract,
    backtest: boolean,
    context: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionConnectionService partialLoss", {
      backtest,
      context,
    });
    await this.getAction(context.actionName, context.strategyName, context.exchangeName, context.frameName, backtest).partialLoss(event);
  };

  /**
   * Routes ping event to appropriate ClientAction instance.
   *
   * @param event - Ping event data
   * @param backtest - Whether running in backtest mode
   * @param context - Execution context with action name, strategy name, exchange name, frame name
   */
  public ping = async (
    event: PingContract,
    backtest: boolean,
    context: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionConnectionService ping", {
      backtest,
      context,
    });
    await this.getAction(context.actionName, context.strategyName, context.exchangeName, context.frameName, backtest).ping(event);
  };

  /**
   * Routes riskRejection event to appropriate ClientAction instance.
   *
   * @param event - Risk rejection event data
   * @param backtest - Whether running in backtest mode
   * @param context - Execution context with action name, strategy name, exchange name, frame name
   */
  public riskRejection = async (
    event: RiskContract,
    backtest: boolean,
    context: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionConnectionService riskRejection", {
      backtest,
      context,
    });
    await this.getAction(context.actionName, context.strategyName, context.exchangeName, context.frameName, backtest).riskRejection(event);
  };

  /**
   * Disposes the ClientAction instance for the given action name.
   *
   * @param backtest - Whether running in backtest mode
   * @param context - Execution context with action name, strategy name, exchange name, frame name
   */
  public dispose = async (
    backtest: boolean,
    context: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<void> => {
    this.loggerService.log("actionConnectionService dispose", {
      backtest,
      context,
    });
    await this.clear({ ...context, backtest });
  };

  /**
   * Clears the cached ClientAction instance for the given action name.
   *
   * @param payload - Optional payload with actionName, strategyName, exchangeName, frameName, backtest (clears all if not provided)
   */
  public clear = async (
    payload?: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }
  ): Promise<void> => {
    this.loggerService.log("actionConnectionService clear", {
      payload,
    });
    if (!payload) {
      const actions = this.getAction.values();
      this.getAction.clear();
      await Promise.all(actions.map(async (action) => await action.dispose()));
      return;
    }
    const key = CREATE_KEY_FN(payload.actionName, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
    if (!this.getAction.has(key)) {
      return;
    }
    const action = this.getAction(payload.actionName, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
    this.getAction.clear(key);
    await action.dispose();
  };
}

export default ActionConnectionService;
