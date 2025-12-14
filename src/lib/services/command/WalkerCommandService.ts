import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import WalkerLogicPublicService from "../logic/public/WalkerLogicPublicService";
import StrategyValidationService from "../validation/StrategyValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import FrameValidationService from "../validation/FrameValidationService";
import WalkerSchemaService from "../schema/WalkerSchemaService";
import WalkerValidationService from "../validation/WalkerValidationService";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";

const METHOD_NAME_RUN = "walkerCommandService run";

/**
 * Global service providing access to walker functionality.
 *
 * Simple wrapper around WalkerLogicPublicService for dependency injection.
 * Used by public API exports.
 */
export class WalkerCommandService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
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

  /**
   * Runs walker comparison for a symbol with context propagation.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Walker context with strategies and metric
   */
  public run = (
    symbol: string,
    context: {
      walkerName: string;
      exchangeName: string;
      frameName: string;
    }
  ) => {
    this.loggerService.log(METHOD_NAME_RUN, {
      symbol,
      context,
    });
    {
      this.exchangeValidationService.validate(
        context.exchangeName,
        METHOD_NAME_RUN
      );
      this.frameValidationService.validate(context.frameName, METHOD_NAME_RUN);
      this.walkerValidationService.validate(
        context.walkerName,
        METHOD_NAME_RUN
      );
    }
    {
      const walkerSchema = this.walkerSchemaService.get(context.walkerName);
      for (const strategyName of walkerSchema.strategies) {
        const { riskName, riskList } = this.strategySchemaService.get(strategyName);
        this.strategyValidationService.validate(strategyName, METHOD_NAME_RUN);
        riskName && this.riskValidationService.validate(riskName, METHOD_NAME_RUN);
        riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, METHOD_NAME_RUN));
      }
    }
    return this.walkerLogicPublicService.run(symbol, context);
  };
}

export default WalkerCommandService;
