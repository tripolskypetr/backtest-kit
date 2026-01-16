import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import LiveLogicPublicService from "../logic/public/LiveLogicPublicService";
import StrategyValidationService from "../validation/StrategyValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";
import ActionValidationService from "../validation/ActionValidationService";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";

const METHOD_NAME_RUN = "liveCommandService run";

/**
 * Type definition for LiveLogicPublicService.
 * Maps all keys of LiveLogicPublicService to any type.
 */
type TLiveLogicPublicService = {
  [key in keyof LiveLogicPublicService]: any;
};

/**
 * Global service providing access to live trading functionality.
 *
 * Simple wrapper around LiveLogicPublicService for dependency injection.
 * Used by public API exports.
 */
export class LiveCommandService implements TLiveLogicPublicService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly liveLogicPublicService = inject<LiveLogicPublicService>(
    TYPES.liveLogicPublicService
  );
  private readonly strategyValidationService =
    inject<StrategyValidationService>(TYPES.strategyValidationService);
  private readonly exchangeValidationService =
    inject<ExchangeValidationService>(TYPES.exchangeValidationService);
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
   * Runs live trading for a symbol with context propagation.
   *
   * Infinite async generator with crash recovery support.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy and exchange names
   * @returns Infinite async generator yielding opened and closed signals
   */
  public run = (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ) => {
    this.loggerService.log(METHOD_NAME_RUN, {
      symbol,
      context,
    });
    {
      this.strategyValidationService.validate(
        context.strategyName,
        METHOD_NAME_RUN
      );
      this.exchangeValidationService.validate(
        context.exchangeName,
        METHOD_NAME_RUN
      );
    }
    {
      const { riskName, riskList, actions } = this.strategySchemaService.get(
        context.strategyName
      );
      riskName && this.riskValidationService.validate(riskName, METHOD_NAME_RUN);
      riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, METHOD_NAME_RUN));
      actions && actions.forEach((actionName) => this.actionValidationService.validate(actionName, METHOD_NAME_RUN));
    }
    return this.liveLogicPublicService.run(symbol, context);
  };
}

export default LiveCommandService;
