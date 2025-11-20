import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import BacktestLogicPublicService from "../logic/public/BacktestLogicPublicService";

/**
 * Global service providing access to backtest functionality.
 *
 * Simple wrapper around BacktestLogicPublicService for dependency injection.
 * Used by public API exports.
 */
export class BacktestGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly backtestLogicPublicService =
    inject<BacktestLogicPublicService>(TYPES.backtestLogicPublicService);

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
    this.loggerService.log("backtestGlobalService run", {
      symbol,
      context,
    });
    return this.backtestLogicPublicService.run(symbol, context);
  };
}

export default BacktestGlobalService;
