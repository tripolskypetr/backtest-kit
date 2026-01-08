import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import WalkerLogicPrivateService from "../private/WalkerLogicPrivateService";
import WalkerSchemaService from "../../schema/WalkerSchemaService";
import { ExchangeName } from "../../../../interfaces/Exchange.interface";
import { FrameName } from "../../../../interfaces/Frame.interface";
import { WalkerName } from "../../../../interfaces/Walker.interface";

/**
 * Type definition for public WalkerLogic service.
 * Omits private dependencies from WalkerLogicPrivateService.
 */
type IWalkerLogicPrivateService = Omit<WalkerLogicPrivateService, keyof {
  loggerService: never;
  walkerSchemaService: never;
  backtestMarkdownService: never;
  backtestLogicPublicService: never;
}>;

/**
 * Type definition for WalkerLogicPublicService.
 * Maps all keys of IWalkerLogicPrivateService to any type.
 */
type TWalkerLogicPrivateService = {
  [key in keyof IWalkerLogicPrivateService]: any;
};

/**
 * Public service for walker orchestration with context management.
 *
 * Wraps WalkerLogicPrivateService with MethodContextService to provide
 * implicit context propagation for strategyName, exchangeName, frameName, and walkerName.
 *
 * @example
 * ```typescript
 * const walkerLogicPublicService = inject(TYPES.walkerLogicPublicService);
 *
 * const results = await walkerLogicPublicService.run("BTCUSDT", {
 *   walkerName: "my-optimizer",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest",
 *   strategies: ["strategy-v1", "strategy-v2"],
 *   metric: "sharpeRatio",
 * });
 *
 * console.log("Best strategy:", results.bestStrategy);
 * ```
 */
export class WalkerLogicPublicService implements TWalkerLogicPrivateService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly walkerLogicPrivateService =
    inject<WalkerLogicPrivateService>(TYPES.walkerLogicPrivateService);
  private readonly walkerSchemaService =
    inject<WalkerSchemaService>(TYPES.walkerSchemaService);

  /**
   * Runs walker comparison for a symbol with context propagation.
   *
   * Executes backtests for all strategies.
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
    this.loggerService.log("walkerLogicPublicService run", {
      symbol,
      context,
    });

    // Get walker schema
    const walkerSchema = this.walkerSchemaService.get(context.walkerName);

    // Run walker private service with strategies and metric from schema
    return this.walkerLogicPrivateService.run(
      symbol,
      walkerSchema.strategies,
      walkerSchema.metric || "sharpeRatio",
      {
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        walkerName: context.walkerName,
      }
    );
  };
}

export default WalkerLogicPublicService;
