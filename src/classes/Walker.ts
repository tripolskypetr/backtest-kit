import backtest from "../lib";
import { WalkerName, IWalkerResults } from "../interfaces/Walker.interface";

const WALKER_METHOD_NAME_RUN = "WalkerUtils.run";
const WALKER_METHOD_NAME_GET_REPORT = "WalkerUtils.getReport";
const WALKER_METHOD_NAME_DUMP = "WalkerUtils.dump";

/**
 * Utility class for walker operations (strategy comparison).
 *
 * Provides simplified access to walkerLogicPrivateService with logging.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Walker } from "./classes/Walker";
 *
 * const results = await Walker.run("BTCUSDT", {
 *   walkerName: "my-optimizer",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * console.log("Best strategy:", results.bestStrategy);
 * console.log("Best metric:", results.bestMetric);
 * ```
 */
export class WalkerUtils {
  /**
   * Runs walker comparison for a symbol.
   *
   * Executes backtests for all strategies defined in the walker schema
   * and returns comparison results with rankings.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Walker context with walker name, exchange name, and frame name
   * @returns Promise resolving to walker results with best strategy
   *
   * @example
   * ```typescript
   * const results = await Walker.run("BTCUSDT", {
   *   walkerName: "my-optimizer",
   *   exchangeName: "binance",
   *   frameName: "1d-backtest"
   * });
   *
   * console.log("Best strategy:", results.bestStrategy);
   * console.log("All results:", results.allResults);
   * ```
   */
  public run = async (
    symbol: string,
    context: {
      walkerName: WalkerName;
      exchangeName: string;
      frameName: string;
    }
  ): Promise<IWalkerResults> => {
    backtest.loggerService.info(WALKER_METHOD_NAME_RUN, {
      symbol,
      context,
    });

    const walkerSchema = backtest.walkerSchemaService.get(context.walkerName);

    // Clear backtest data for all strategies
    for (const strategyName of walkerSchema.strategies) {
      backtest.backtestMarkdownService.clear(strategyName);
      backtest.strategyGlobalService.clear(strategyName);
    }

    // Run walker comparison via global service
    const results = await backtest.walkerGlobalService.run(symbol, {
      walkerName: context.walkerName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
    });

    // Call onComplete callback if provided
    if (walkerSchema.callbacks?.onComplete) {
      walkerSchema.callbacks.onComplete(results);
    }

    return results;
  };

  /**
   * Generates markdown report from walker results.
   *
   * @param walkerName - Walker name to generate report for
   * @returns Promise resolving to markdown string
   *
   * @example
   * ```typescript
   * const results = await Walker.run("BTCUSDT", { walkerName: "my-optimizer" });
   * const markdown = await Walker.getReport(results);
   * console.log(markdown);
   * ```
   */
  public getReport = async (results: IWalkerResults): Promise<string> => {
    backtest.loggerService.info(WALKER_METHOD_NAME_GET_REPORT, {
      walkerName: results.walkerName,
    });

    return await backtest.walkerMarkdownService.getReport(results);
  };

  /**
   * Saves walker report to disk.
   *
   * @param results - Walker results to save
   * @param path - Optional custom path (default: ./logs/walker)
   *
   * @example
   * ```typescript
   * const results = await Walker.run("BTCUSDT", { walkerName: "my-optimizer" });
   * await Walker.dump(results); // Saves to ./logs/walker/my-optimizer.md
   * ```
   */
  public dump = async (
    results: IWalkerResults,
    path = "./logs/walker"
  ): Promise<void> => {
    backtest.loggerService.info(WALKER_METHOD_NAME_DUMP, {
      walkerName: results.walkerName,
      path,
    });

    await backtest.walkerMarkdownService.dump(results, path);
  };
}

/**
 * Singleton instance of WalkerUtils for convenient usage.
 */
export const Walker = new WalkerUtils();

export default Walker;
