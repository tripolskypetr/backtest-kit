import backtest from "../lib";
import { WalkerName, WalkerMetric } from "../interfaces/Walker.interface";
import { errorEmitter, doneEmitter } from "../config/emitters";
import { getErrorMessage } from "functools-kit";

const WALKER_METHOD_NAME_RUN = "WalkerUtils.run";
const WALKER_METHOD_NAME_BACKGROUND = "WalkerUtils.background";
const WALKER_METHOD_NAME_GET_DATA = "WalkerUtils.getData";
const WALKER_METHOD_NAME_GET_REPORT = "WalkerUtils.getReport";
const WALKER_METHOD_NAME_DUMP = "WalkerUtils.dump";

/**
 * Utility class for walker operations.
 *
 * Provides simplified access to walkerGlobalService.run() with logging.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Walker } from "./classes/Walker";
 *
 * for await (const result of Walker.run("BTCUSDT", {
 *   walkerName: "my-walker",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * })) {
 *   console.log("Progress:", result.strategiesTested, "/", result.totalStrategies);
 *   console.log("Best strategy:", result.bestStrategy, result.bestMetric);
 * }
 * ```
 */
export class WalkerUtils {
  /**
   * Runs walker comparison for a symbol with context propagation.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with walker, exchange, and frame names
   * @returns Async generator yielding progress updates after each strategy
   */
  public run = (
    symbol: string,
    context: {
      walkerName: string;
      exchangeName: string;
      frameName: string;
    }
  ) => {
    backtest.loggerService.info(WALKER_METHOD_NAME_RUN, {
      symbol,
      context,
    });

    {
      backtest.walkerValidationService.validate(context.walkerName, WALKER_METHOD_NAME_RUN);
      backtest.exchangeValidationService.validate(context.exchangeName, WALKER_METHOD_NAME_RUN);
      backtest.frameValidationService.validate(context.frameName, WALKER_METHOD_NAME_RUN);
    }

    const walkerSchema = backtest.walkerSchemaService.get(context.walkerName);

    for (const strategyName of walkerSchema.strategies) {
      backtest.strategyValidationService.validate(strategyName, WALKER_METHOD_NAME_RUN);
    }
    
    backtest.walkerMarkdownService.clear(context.walkerName);

    // Clear backtest data for all strategies
    for (const strategyName of walkerSchema.strategies) {
      backtest.backtestMarkdownService.clear(strategyName);
      backtest.strategyGlobalService.clear(strategyName);
    }

    return backtest.walkerGlobalService.run(symbol, context);
  };

  /**
   * Runs walker comparison in background without yielding results.
   *
   * Consumes all walker progress updates internally without exposing them.
   * Useful for running walker comparison for side effects only (callbacks, logging).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with walker, exchange, and frame names
   * @returns Cancellation closure
   *
   * @example
   * ```typescript
   * // Run walker silently, only callbacks will fire
   * await Walker.background("BTCUSDT", {
   *   walkerName: "my-walker",
   *   exchangeName: "binance",
   *   frameName: "1d-backtest"
   * });
   * console.log("Walker comparison completed");
   * ```
   */
  public background = (
    symbol: string,
    context: {
      walkerName: string;
      exchangeName: string;
      frameName: string;
    }
  ) => {
    backtest.loggerService.info(WALKER_METHOD_NAME_BACKGROUND, {
      symbol,
      context,
    });
    let isStopped = false;
    const task = async () => {
      for await (const _ of this.run(symbol, context)) {
        if (isStopped) {
          break;
        }
      }
      await doneEmitter.next({
        exchangeName: context.exchangeName,
        strategyName: context.walkerName,
        backtest: true,
        symbol,
      });
    };
    task().catch((error) =>
      errorEmitter.next(new Error(getErrorMessage(error)))
    );
    return () => {
      isStopped = true;
    };
  };

  /**
   * Gets walker results data from all strategy comparisons.
   *
   * @param walkerName - Walker name to get data for
   * @param symbol - Trading symbol
   * @param metric - Metric being optimized
   * @param context - Context with exchangeName and frameName
   * @returns Promise resolving to walker results data object
   *
   * @example
   * ```typescript
   * const results = await Walker.getData("my-walker", "BTCUSDT", "sharpeRatio", {
   *   exchangeName: "binance",
   *   frameName: "1d-backtest"
   * });
   * console.log(results.bestStrategy, results.bestMetric);
   * ```
   */
  public getData = async (
    walkerName: WalkerName,
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: string;
      frameName: string;
    }
  ) => {
    backtest.loggerService.info(WALKER_METHOD_NAME_GET_DATA, {
      walkerName,
      symbol,
      metric,
      context,
    });
    return await backtest.walkerMarkdownService.getData(
      walkerName,
      symbol,
      metric,
      context
    );
  };

  /**
   * Generates markdown report with all strategy comparisons for a walker.
   *
   * @param walkerName - Walker name to generate report for
   * @param symbol - Trading symbol
   * @param metric - Metric being optimized
   * @param context - Context with exchangeName and frameName
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Walker.getReport("my-walker", "BTCUSDT", "sharpeRatio", {
   *   exchangeName: "binance",
   *   frameName: "1d-backtest"
   * });
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    walkerName: WalkerName,
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: string;
      frameName: string;
    }
  ): Promise<string> => {
    backtest.loggerService.info(WALKER_METHOD_NAME_GET_REPORT, {
      walkerName,
      symbol,
      metric,
      context,
    });
    return await backtest.walkerMarkdownService.getReport(
      walkerName,
      symbol,
      metric,
      context
    );
  };

  /**
   * Saves walker report to disk.
   *
   * @param walkerName - Walker name to save report for
   * @param symbol - Trading symbol
   * @param metric - Metric being optimized
   * @param context - Context with exchangeName and frameName
   * @param path - Optional directory path to save report (default: "./logs/walker")
   *
   * @example
   * ```typescript
   * // Save to default path: ./logs/walker/my-walker.md
   * await Walker.dump("my-walker", "BTCUSDT", "sharpeRatio", {
   *   exchangeName: "binance",
   *   frameName: "1d-backtest"
   * });
   *
   * // Save to custom path: ./custom/path/my-walker.md
   * await Walker.dump("my-walker", "BTCUSDT", "sharpeRatio", {
   *   exchangeName: "binance",
   *   frameName: "1d-backtest"
   * }, "./custom/path");
   * ```
   */
  public dump = async (
    walkerName: WalkerName,
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: string;
      frameName: string;
    },
    path?: string
  ): Promise<void> => {
    backtest.loggerService.info(WALKER_METHOD_NAME_DUMP, {
      walkerName,
      symbol,
      metric,
      context,
      path,
    });
    await backtest.walkerMarkdownService.dump(
      walkerName,
      symbol,
      metric,
      context,
      path
    );
  };
}

/**
 * Singleton instance of WalkerUtils for convenient walker operations.
 *
 * @example
 * ```typescript
 * import { Walker } from "./classes/Walker";
 *
 * for await (const result of Walker.run("BTCUSDT", {
 *   walkerName: "my-walker",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * })) {
 *   console.log("Progress:", result.strategiesTested, "/", result.totalStrategies);
 *   console.log("Best so far:", result.bestStrategy, result.bestMetric);
 * }
 * ```
 */
export const Walker = new WalkerUtils();
