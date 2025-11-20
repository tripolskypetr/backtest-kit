import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import LiveLogicPublicService from "../logic/public/LiveLogicPublicService";

/**
 * Global service providing access to live trading functionality.
 *
 * Simple wrapper around LiveLogicPublicService for dependency injection.
 * Used by public API exports.
 */
export class LiveGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly liveLogicPublicService = inject<LiveLogicPublicService>(
    TYPES.liveLogicPublicService
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
      strategyName: string;
      exchangeName: string;
    }
  ) => {
    this.loggerService.log("liveGlobalService run", {
      symbol,
      context,
    });
    return this.liveLogicPublicService.run(symbol, context);
  };
}

export default LiveGlobalService;
