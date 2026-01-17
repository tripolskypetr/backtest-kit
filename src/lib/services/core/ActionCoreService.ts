import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import ActionConnectionService from "../connection/ActionConnectionService";
import { IAction, ActionName } from "../../../interfaces/Action.interface";
import { memoize } from "functools-kit";
import ActionValidationService from "../validation/ActionValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import FrameValidationService from "../validation/FrameValidationService";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { IStrategyTickResult } from "../../../interfaces/Strategy.interface";
import { BreakevenContract } from "../../../contract/Breakeven.contract";
import { PartialProfitContract } from "../../../contract/PartialProfit.contract";
import { PartialLossContract } from "../../../contract/PartialLoss.contract";
import { SchedulePingContract } from "../../../contract/SchedulePing.contract";
import { ActivePingContract } from "../../../contract/ActivePing.contract";
import { RiskContract } from "../../../contract/Risk.contract";
import StrategySchemaService from "../schema/StrategySchemaService";
import StrategyValidationService from "../validation/StrategyValidationService";
import RiskValidationService from "../validation/RiskValidationService";

const METHOD_NAME_VALIDATE = "actionCoreService validate";

/**
 * Creates a unique key for memoizing validate calls.
 * Key format: "strategyName:exchangeName:frameName"
 * @param context - Execution context with strategyName, exchangeName, frameName
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }): string => {
  const parts = [context.strategyName, context.exchangeName];
  if (context.frameName) parts.push(context.frameName);
  return parts.join(":");
};

/**
 * Type definition for action methods.
 * Maps all keys of IAction to any type.
 * Used for dynamic method routing in ActionCoreService.
 */
type TAction = {
  [key in keyof IAction]: any;
};

/**
 * Global service for action operations.
 *
 * Manages action dispatching for strategies by automatically resolving
 * action lists from strategy schemas and invoking handlers for each registered action.
 *
 * Key responsibilities:
 * - Retrieves action list from strategy schema (IStrategySchema.actions)
 * - Validates strategy context (strategyName, exchangeName, frameName)
 * - Validates all associated actions, risks from strategy schema
 * - Dispatches events to all registered actions in sequence
 *
 * Used internally by strategy execution and public API.
 */
export class ActionCoreService implements TAction {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly actionConnectionService = inject<ActionConnectionService>(
    TYPES.actionConnectionService
  );
  private readonly actionValidationService = inject<ActionValidationService>(
    TYPES.actionValidationService
  );
  private readonly exchangeValidationService = inject<ExchangeValidationService>(
    TYPES.exchangeValidationService
  );
  private readonly frameValidationService = inject<FrameValidationService>(
    TYPES.frameValidationService
  );
  private readonly strategyValidationService =
    inject<StrategyValidationService>(TYPES.strategyValidationService);
  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService
  );

  /**
   * Validates strategy context and all associated configurations.
   *
   * Memoized to avoid redundant validations for the same strategy-exchange-frame combination.
   * Retrieves strategy schema and validates:
   * - Strategy name existence
   * - Exchange name validity
   * - Frame name validity (if provided)
   * - Risk profile(s) validity (if configured in strategy schema)
   * - Action name(s) validity (if configured in strategy schema)
   *
   * @param context - Strategy execution context with strategyName, exchangeName and frameName
   * @returns Promise that resolves when all validations complete
   */
  private validate = memoize(
    ([context]) => CREATE_KEY_FN(context),
    async (context: {  strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        context,
      });
      const { riskName, riskList, actions } = this.strategySchemaService.get(context.strategyName);
      this.strategyValidationService.validate(
        context.strategyName,
        METHOD_NAME_VALIDATE
      );
      this.exchangeValidationService.validate(
        context.exchangeName,
        METHOD_NAME_VALIDATE
      );
      context.frameName && this.frameValidationService.validate(context.frameName, METHOD_NAME_VALIDATE);
      riskName && this.riskValidationService.validate(riskName, METHOD_NAME_VALIDATE);
      riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, METHOD_NAME_VALIDATE));
      actions && actions.forEach((actionName) => this.actionValidationService.validate(actionName, METHOD_NAME_VALIDATE));
    }
  );

  /**
   * Initializes all ClientAction instances for the strategy.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the init handler on each ClientAction instance sequentially.
   * Calls waitForInit() on each action to load persisted state.
   *
   * @param backtest - Whether running in backtest mode (true) or live mode (false)
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public initFn = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<void> => {
    this.loggerService.log("actionCoreService initFn", {
      backtest,
      context,
      symbol,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.initFn(backtest, { actionName, ...context });
    }
  };

  /**
   * Routes signal event to all registered actions for the strategy.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the signal handler on each ClientAction instance sequentially.
   *
   * @param backtest - Whether running in backtest mode (true) or live mode (false)
   * @param event - Signal state result (idle, scheduled, opened, active, closed, cancelled)
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public signal = async (
    backtest: boolean,
    event: IStrategyTickResult,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionCoreService signal", {
      action: event.action,
      context,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.signal(event, backtest, { actionName, ...context });
    }
  };

  /**
   * Routes signal event from live trading to all registered actions.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the signalLive handler on each ClientAction instance sequentially.
   *
   * @param backtest - Whether running in backtest mode (always false for signalLive)
   * @param event - Signal state result from live trading
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public signalLive = async (
    backtest: boolean,
    event: IStrategyTickResult,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionCoreService signalLive", {
      action: event.action,
      context,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.signalLive(event, backtest, { actionName, ...context });
    }
  };

  /**
   * Routes signal event from backtest to all registered actions.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the signalBacktest handler on each ClientAction instance sequentially.
   *
   * @param backtest - Whether running in backtest mode (always true for signalBacktest)
   * @param event - Signal state result from backtest
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public signalBacktest = async (
    backtest: boolean,
    event: IStrategyTickResult,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionCoreService signalBacktest", {
      action: event.action,
      context,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.signalBacktest(event, backtest, { actionName, ...context });
    }
  };

  /**
   * Routes breakeven event to all registered actions for the strategy.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the breakeven handler on each ClientAction instance sequentially.
   *
   * @param backtest - Whether running in backtest mode (true) or live mode (false)
   * @param event - Breakeven milestone data (stop-loss moved to entry price)
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public breakeven = async (
    backtest: boolean,
    event: BreakevenContract,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionCoreService breakeven", {
      context,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.breakeven(event, backtest, { actionName, ...context });
    }
  };

  /**
   * Routes partial profit event to all registered actions for the strategy.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the partialProfit handler on each ClientAction instance sequentially.
   *
   * @param backtest - Whether running in backtest mode (true) or live mode (false)
   * @param event - Profit milestone data with level (10%, 20%, etc.) and price
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public partialProfit = async (
    backtest: boolean,
    event: PartialProfitContract,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionCoreService partialProfit", {
      context,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.partialProfit(event, backtest, { actionName, ...context });
    }
  };

  /**
   * Routes partial loss event to all registered actions for the strategy.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the partialLoss handler on each ClientAction instance sequentially.
   *
   * @param backtest - Whether running in backtest mode (true) or live mode (false)
   * @param event - Loss milestone data with level (-10%, -20%, etc.) and price
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public partialLoss = async (
    backtest: boolean,
    event: PartialLossContract,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionCoreService partialLoss", {
      context,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.partialLoss(event, backtest, { actionName, ...context });
    }
  };

  /**
   * Routes scheduled ping event to all registered actions for the strategy.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the pingScheduled handler on each ClientAction instance sequentially.
   * Called every minute during scheduled signal monitoring.
   *
   * @param backtest - Whether running in backtest mode (true) or live mode (false)
   * @param event - Scheduled signal monitoring data
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public pingScheduled = async (
    backtest: boolean,
    event: SchedulePingContract,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionCoreService pingScheduled", {
      context,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.pingScheduled(event, backtest, { actionName, ...context });
    }
  };

  /**
   * Routes active ping event to all registered actions for the strategy.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the pingActive handler on each ClientAction instance sequentially.
   * Called every minute during active pending signal monitoring.
   *
   * @param backtest - Whether running in backtest mode (true) or live mode (false)
   * @param event - Active pending signal monitoring data
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public pingActive = async (
    backtest: boolean,
    event: ActivePingContract,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionCoreService pingActive", {
      context,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.pingActive(event, backtest, { actionName, ...context });
    }
  };

  /**
   * Routes risk rejection event to all registered actions for the strategy.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the riskRejection handler on each ClientAction instance sequentially.
   * Called only when a signal fails risk validation.
   *
   * @param backtest - Whether running in backtest mode (true) or live mode (false)
   * @param event - Risk rejection data with reason and context
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public riskRejection = async (
    backtest: boolean,
    event: RiskContract,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("actionCoreService riskRejection", {
      context,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.riskRejection(event, backtest, { actionName, ...context });
    }
  };

  /**
   * Disposes all ClientAction instances for the strategy.
   *
   * Retrieves action list from strategy schema (IStrategySchema.actions)
   * and invokes the dispose handler on each ClientAction instance sequentially.
   * Called when strategy execution ends to clean up resources.
   *
   * @param backtest - Whether running in backtest mode (true) or live mode (false)
   * @param context - Strategy execution context with strategyName, exchangeName, frameName
   */
  public dispose = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<void> => {
    this.loggerService.log("actionCoreService dispose", {
      context,
      symbol,
    });

    await this.validate(context);

    const { actions = [] } = this.strategySchemaService.get(context.strategyName);

    for (const actionName of actions) {
      await this.actionConnectionService.dispose(backtest, { actionName, ...context });
    }
  };

  /**
   * Clears action data.
   *
   * If payload is provided, validates and clears data for the specific action instance.
   * If no payload is provided, clears all action data across all strategies.
   *
   * @param payload - Optional payload with actionName, strategyName, exchangeName, frameName, backtest (clears all if not provided)
   */
  public clear = async (
    payload?: { actionName: ActionName; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }
  ): Promise<void> => {
    this.loggerService.log("actionCoreService clear", {
      payload,
    });
    if (payload) {
      await this.validate(payload);
    }
    return await this.actionConnectionService.clear(payload);
  };
}

export default ActionCoreService;
