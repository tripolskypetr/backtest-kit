import backtest from "../lib";
import { WalkerName } from "../interfaces/Walker.interface";
import { errorEmitter, doneWalkerSubject } from "../config/emitters";
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
 * Automatically pulls exchangeName and frameName from walker schema.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Walker } from "./classes/Walker";
 *
 * for await (const result of Walker.run("BTCUSDT", {
 *   walkerName: "my-walker"
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
   * @param context - Execution context with walker name
   * @returns Async generator yielding progress updates after each strategy
   */
  public run = (
    symbol: string,
    context: {
      walkerName: string;
    }
  ) => {
    backtest.loggerService.info(WALKER_METHOD_NAME_RUN, {
      symbol,
      context,
    });

    backtest.walkerValidationService.validate(context.walkerName, WALKER_METHOD_NAME_RUN);

    const walkerSchema = backtest.walkerSchemaService.get(context.walkerName);

    backtest.exchangeValidationService.validate(walkerSchema.exchangeName, WALKER_METHOD_NAME_RUN);
    backtest.frameValidationService.validate(walkerSchema.frameName, WALKER_METHOD_NAME_RUN);

    for (const strategyName of walkerSchema.strategies) {
      backtest.strategyValidationService.validate(strategyName, WALKER_METHOD_NAME_RUN);
    }

    backtest.walkerMarkdownService.clear(context.walkerName);

    // Clear backtest data for all strategies
    for (const strategyName of walkerSchema.strategies) {
      
      {
        backtest.backtestMarkdownService.clear(strategyName);
        backtest.scheduleMarkdownService.clear(strategyName);
      }

      {
        backtest.strategyGlobalService.clear(strategyName);
      }

      {
        const { riskName } = backtest.strategySchemaService.get(strategyName);
        riskName && backtest.riskGlobalService.clear(riskName);
      }

    }

    return backtest.walkerGlobalService.run(symbol, {
      walkerName: context.walkerName,
      exchangeName: walkerSchema.exchangeName,
      frameName: walkerSchema.frameName,
    });
  };

  /**
   * Runs walker comparison in background without yielding results.
   *
   * Consumes all walker progress updates internally without exposing them.
   * Useful for running walker comparison for side effects only (callbacks, logging).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with walker name
   * @returns Cancellation closure
   *
   * @example
   * ```typescript
   * // Run walker silently, only callbacks will fire
   * await Walker.background("BTCUSDT", {
   *   walkerName: "my-walker"
   * });
   * console.log("Walker comparison completed");
   * ```
   */
  public background = (
    symbol: string,
    context: {
      walkerName: string;
    }
  ) => {
    backtest.loggerService.info(WALKER_METHOD_NAME_BACKGROUND, {
      symbol,
      context,
    });

    const walkerSchema = backtest.walkerSchemaService.get(context.walkerName);

    let isStopped = false;
    const task = async () => {
      for await (const _ of this.run(symbol, context)) {
        if (isStopped) {
          break;
        }
      }
      await doneWalkerSubject.next({
        exchangeName: walkerSchema.exchangeName,
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
      for (const strategyName of walkerSchema.strategies) {
        backtest.strategyGlobalService.stop(strategyName);
      }
    };
  };

  /**
   * Gets walker results data from all strategy comparisons.
   *
   * @param symbol - Trading symbol
   * @param walkerName - Walker name to get data for
   * @returns Promise resolving to walker results data object
   *
   * @example
   * ```typescript
   * const results = await Walker.getData("BTCUSDT", "my-walker");
   * console.log(results.bestStrategy, results.bestMetric);
   * ```
   */
  public getData = async (
    symbol: string,
    walkerName: WalkerName
  ) => {
    backtest.loggerService.info(WALKER_METHOD_NAME_GET_DATA, {
      symbol,
      walkerName,
    });

    const walkerSchema = backtest.walkerSchemaService.get(walkerName);

    return await backtest.walkerMarkdownService.getData(
      walkerName,
      symbol,
      walkerSchema.metric || "sharpeRatio",
      {
        exchangeName: walkerSchema.exchangeName,
        frameName: walkerSchema.frameName,
      }
    );
  };

  /**
   * Generates markdown report with all strategy comparisons for a walker.
   *
   * @param symbol - Trading symbol
   * @param walkerName - Walker name to generate report for
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Walker.getReport("BTCUSDT", "my-walker");
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    symbol: string,
    walkerName: WalkerName
  ): Promise<string> => {
    backtest.loggerService.info(WALKER_METHOD_NAME_GET_REPORT, {
      symbol,
      walkerName,
    });

    const walkerSchema = backtest.walkerSchemaService.get(walkerName);

    return await backtest.walkerMarkdownService.getReport(
      walkerName,
      symbol,
      walkerSchema.metric || "sharpeRatio",
      {
        exchangeName: walkerSchema.exchangeName,
        frameName: walkerSchema.frameName,
      }
    );
  };

  /**
   * Saves walker report to disk.
   *
   * @param symbol - Trading symbol
   * @param walkerName - Walker name to save report for
   * @param path - Optional directory path to save report (default: "./logs/walker")
   *
   * @example
   * ```typescript
   * // Save to default path: ./logs/walker/my-walker.md
   * await Walker.dump("BTCUSDT", "my-walker");
   *
   * // Save to custom path: ./custom/path/my-walker.md
   * await Walker.dump("BTCUSDT", "my-walker", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    walkerName: WalkerName,
    path?: string
  ): Promise<void> => {
    backtest.loggerService.info(WALKER_METHOD_NAME_DUMP, {
      symbol,
      walkerName,
      path,
    });

    const walkerSchema = backtest.walkerSchemaService.get(walkerName);

    await backtest.walkerMarkdownService.dump(
      walkerName,
      symbol,
      walkerSchema.metric || "sharpeRatio",
      {
        exchangeName: walkerSchema.exchangeName,
        frameName: walkerSchema.frameName,
      },
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
 *   walkerName: "my-walker"
 * })) {
 *   console.log("Progress:", result.strategiesTested, "/", result.totalStrategies);
 *   console.log("Best so far:", result.bestStrategy, result.bestMetric);
 * }
 * ```
 */
export const Walker = new WalkerUtils();
