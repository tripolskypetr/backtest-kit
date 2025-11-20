import backtest from "../lib";

const BACKTEST_METHOD_NAME_RUN = "BacktestUtils.run";

/**
 * Utility class for backtest operations.
 *
 * Provides simplified access to backtestGlobalService.run() with logging.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Backtest } from "./classes/Backtest";
 *
 * for await (const result of Backtest.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: "1d-backtest"
 * })) {
 *   console.log("Closed signal PNL:", result.pnl.pnlPercentage);
 * }
 * ```
 */
export class BacktestUtils {
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
    backtest.loggerService.info(BACKTEST_METHOD_NAME_RUN, {
      symbol,
      context,
    });
    return backtest.backtestGlobalService.run(symbol, context);
  };
}

/**
 * Singleton instance of BacktestUtils for convenient backtest operations.
 *
 * @example
 * ```typescript
 * import { Backtest } from "./classes/Backtest";
 *
 * for await (const result of Backtest.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: "1d-backtest"
 * })) {
 *   if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.pnlPercentage);
 *   }
 * }
 * ```
 */
export const Backtest = new BacktestUtils();
