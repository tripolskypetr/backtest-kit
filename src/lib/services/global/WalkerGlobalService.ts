import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import WalkerLogicPublicService from "../logic/public/WalkerLogicPublicService";

const METHOD_NAME_RUN = "walkerGlobalService run";

/**
 * Global service providing access to walker functionality.
 *
 * Simple wrapper around WalkerLogicPublicService for dependency injection.
 * Used by public API exports.
 */
export class WalkerGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly walkerLogicPublicService =
    inject<WalkerLogicPublicService>(TYPES.walkerLogicPublicService);

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
    return this.walkerLogicPublicService.run(symbol, context);
  };
}

export default WalkerGlobalService;
