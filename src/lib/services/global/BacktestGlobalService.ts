import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import BacktestLogicPublicService from "../logic/public/BacktestLogicPublicService";
import StrategyValidationService from "../validation/StrategyValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import FrameValidationService from "../validation/FrameValidationService";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";

const METHOD_NAME_RUN = "backtestGlobalService run";

/**
 * Global service providing access to backtest functionality.
 *
 * Simple wrapper around BacktestLogicPublicService for dependency injection.
 * Used by public API exports.
 */
export class BacktestGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );  
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService
  );
  private readonly backtestLogicPublicService =
    inject<BacktestLogicPublicService>(TYPES.backtestLogicPublicService);
  private readonly strategyValidationService =
    inject<StrategyValidationService>(TYPES.strategyValidationService);
  private readonly exchangeValidationService =
    inject<ExchangeValidationService>(TYPES.exchangeValidationService);
  private readonly frameValidationService = inject<FrameValidationService>(
    TYPES.frameValidationService
  );

  /**
   * Runs backtest for a symbol with context propagation.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy, exchange, and frame names
   * @returns Async generator yielding closed signals with PNL
   */
  public run = (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
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
      this.frameValidationService.validate(context.frameName, METHOD_NAME_RUN);
    }
    {
      const strategySchema = this.strategySchemaService.get(
        context.strategyName
      );
      const riskName = strategySchema.riskName;
      riskName && this.riskValidationService.validate(riskName, METHOD_NAME_RUN);
    }
    return this.backtestLogicPublicService.run(symbol, context);
  };
}

export default BacktestGlobalService;
