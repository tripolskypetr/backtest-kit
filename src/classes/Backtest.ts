import backtest from "../lib";
import { StrategyName } from "../interfaces/Strategy.interface";

const BACKTEST_METHOD_NAME_RUN = "BacktestUtils.run";
const BACKTEST_METHOD_NAME_BACKGROUND = "BacktestUtils.background";
const BACKTEST_METHOD_NAME_GET_REPORT = "BacktestUtils.getReport";
const BACKTEST_METHOD_NAME_DUMP = "BacktestUtils.dump";
const BACKTEST_METHOD_NAME_CLEAR = "BacktestUtils.clear";

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

  /**
   * Runs backtest in background without yielding results.
   *
   * Consumes all backtest results internally without exposing them.
   * Useful for running backtests for side effects only (callbacks, logging).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy, exchange, and frame names
   * @returns Cancellation closure
   *
   * @example
   * ```typescript
   * // Run backtest silently, only callbacks will fire
   * await Backtest.background("BTCUSDT", {
   *   strategyName: "my-strategy",
   *   exchangeName: "my-exchange",
   *   frameName: "1d-backtest"
   * });
   * console.log("Backtest completed");
   * ```
   */
  public background = async (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_BACKGROUND, {
      symbol,
      context,
    });
    const iterator = this.run(symbol, context);
    let isStopped = false;
    const task = async () => {
      while (true) {
        const { done } = await iterator.next();
        if (done) {
          break;
        }
        if (isStopped) {
          break;
        }
      }
    }
    task();
    return () => {
      isStopped = true;
    }
  };

  /**
   * Generates markdown report with all closed signals for a strategy.
   *
   * @param strategyName - Strategy name to generate report for
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Backtest.getReport("my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (strategyName: StrategyName): Promise<string> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_REPORT, {
      strategyName,
    });
    return await backtest.backtestMarkdownService.getReport(strategyName);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./logs/backtest")
   *
   * @example
   * ```typescript
   * // Save to default path: ./logs/backtest/my-strategy.md
   * await Backtest.dump("my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await Backtest.dump("my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    strategyName: StrategyName,
    path?: string
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_DUMP, {
      strategyName,
      path,
    });
    await backtest.backtestMarkdownService.dump(strategyName, path);
  };

  /**
   * Clears accumulated signal data from storage.
   *
   * @param strategyName - Optional strategy name to clear specific strategy data.
   *                       If omitted, clears all strategies' data.
   *
   * @example
   * ```typescript
   * // Clear specific strategy data
   * await Backtest.clear("my-strategy");
   *
   * // Clear all strategies' data
   * await Backtest.clear();
   * ```
   */
  public clear = async (strategyName?: StrategyName): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_CLEAR, {
      strategyName,
    });
    await backtest.backtestMarkdownService.clear(strategyName);
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
