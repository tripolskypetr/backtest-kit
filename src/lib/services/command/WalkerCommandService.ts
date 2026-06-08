import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import WalkerLogicPublicService from "../logic/public/WalkerLogicPublicService";
import StrategyValidationService from "../validation/StrategyValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import FrameValidationService from "../validation/FrameValidationService";
import WalkerSchemaService from "../schema/WalkerSchemaService";
import WalkerValidationService from "../validation/WalkerValidationService";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";
import ActionValidationService from "../validation/ActionValidationService";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { WalkerName } from "../../../interfaces/Walker.interface";
import { memoize } from "functools-kit";

const METHOD_NAME_RUN = "walkerCommandService run";
const METHOD_NAME_VALIDATE = "walkerCommandService validate";

/**
 * Creates a unique key for memoizing validate calls.
 * Key format: "walkerName:exchangeName:frameName"
 * @param context - Context with walkerName, exchangeName, frameName
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (context: { walkerName: WalkerName; exchangeName: ExchangeName; frameName: FrameName }): string => {
  const parts = [context.walkerName, context.exchangeName];
  if (context.frameName) parts.push(context.frameName);
  return parts.join(":");
};

/**
 * Type definition for WalkerLogicPublicService.
 * Maps all keys of WalkerLogicPublicService to any type.
 */
type TWalkerLogicPublicService = {
  [key in keyof WalkerLogicPublicService]: any;
};

/**
 * Global service providing access to walker functionality.
 *
 * Simple wrapper around WalkerLogicPublicService for dependency injection.
 * Used by public API exports.
 */
export class WalkerCommandService implements TWalkerLogicPublicService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  private readonly walkerLogicPublicService = inject<WalkerLogicPublicService>(
    TYPES.walkerLogicPublicService
  );
  private readonly walkerSchemaService = inject<WalkerSchemaService>(
    TYPES.walkerSchemaService
  );
  private readonly strategyValidationService =
    inject<StrategyValidationService>(TYPES.strategyValidationService);
  private readonly exchangeValidationService =
    inject<ExchangeValidationService>(TYPES.exchangeValidationService);
  private readonly frameValidationService = inject<FrameValidationService>(
    TYPES.frameValidationService
  );
  private readonly walkerValidationService = inject<WalkerValidationService>(
    TYPES.walkerValidationService
  );
  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService
  );
  private readonly actionValidationService = inject<ActionValidationService>(
    TYPES.actionValidationService
  );

  /**
   * Validates walker and associated strategy configurations.
   * Memoized to avoid redundant validations for the same walker-exchange-frame combination.
   *
   * Strategy/risk/action validation is performed explicitly here in addition to the
   * cascade inside WalkerValidationService — this is critical-path code and the
   * redundant check is intentional defense-in-depth.
   *
   * @param context - Context with walkerName, exchangeName and frameName
   * @param methodName - Name of the calling method for error tracking
   */
  private validate = memoize(
    ([context]) => CREATE_KEY_FN(context),
    (context: { walkerName: WalkerName; exchangeName: ExchangeName; frameName: FrameName }, methodName: string) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        context,
        methodName,
      });
      this.exchangeValidationService.validate(context.exchangeName, methodName);
      this.frameValidationService.validate(context.frameName, methodName);
      this.walkerValidationService.validate(context.walkerName, methodName);
      const walkerSchema = this.walkerSchemaService.get(context.walkerName);
      for (const strategyName of walkerSchema.strategies) {
        const { riskName, riskList, actions } = this.strategySchemaService.get(strategyName);
        this.strategyValidationService.validate(strategyName, methodName);
        riskName && this.riskValidationService.validate(riskName, methodName);
        riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, methodName));
        actions && actions.forEach((actionName) => this.actionValidationService.validate(actionName, methodName));
      }
    }
  );

  /**
   * Runs walker comparison for a symbol with context propagation.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Walker context with strategies and metric
   */
  public run = (
    symbol: string,
    context: {
      walkerName: WalkerName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    this.loggerService.log(METHOD_NAME_RUN, {
      symbol,
      context,
    });
    this.validate(context, METHOD_NAME_RUN);
    return this.walkerLogicPublicService.run(symbol, context);
  };
}

export default WalkerCommandService;
