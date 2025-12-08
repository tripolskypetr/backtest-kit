import backtest from "../lib";
import { StrategyName } from "../interfaces/Strategy.interface";
import { exitEmitter, doneBacktestSubject } from "../config/emitters";
import { getErrorMessage, memoize } from "functools-kit";

const BACKTEST_METHOD_NAME_RUN = "BacktestUtils.run";
const BACKTEST_METHOD_NAME_BACKGROUND = "BacktestUtils.background";
const BACKTEST_METHOD_NAME_STOP = "BacktestUtils.stop";
const BACKTEST_METHOD_NAME_GET_REPORT = "BacktestUtils.getReport";
const BACKTEST_METHOD_NAME_DUMP = "BacktestUtils.dump";

/**
 * Instance class for backtest operations on a specific symbol-strategy pair.
 *
 * Provides isolated backtest execution and reporting for a single symbol-strategy combination.
 * Each instance maintains its own state and context.
 *
 * @example
 * ```typescript
 * const instance = new BacktestInstance("BTCUSDT", "my-strategy");
 *
 * for await (const result of instance.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: "1d-backtest"
 * })) {
 *   console.log("Closed signal PNL:", result.pnl.pnlPercentage);
 * }
 * ```
 */
export class BacktestInstance {
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

    {
      backtest.backtestMarkdownService.clear({ symbol, strategyName: context.strategyName });
      backtest.scheduleMarkdownService.clear({ symbol, strategyName: context.strategyName });
    }

    {
      backtest.strategyGlobalService.clear({ symbol, strategyName: context.strategyName });
    }

    {
      const { riskName } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskGlobalService.clear(riskName);
    }

    return backtest.backtestCommandService.run(symbol, context);
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
   * const instance = new BacktestInstance();
   * const cancel = instance.background("BTCUSDT", {
   *   strategyName: "my-strategy",
   *   exchangeName: "my-exchange",
   *   frameName: "1d-backtest"
   * });
   * ```
   */
  public background = (
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
    let isStopped = false;
    let isDone = false;
    const task = async () => {
      for await (const _ of this.run(symbol, context)) {
        if (isStopped) {
          break;
        }
      }
      if (!isDone) {
        await doneBacktestSubject.next({
          exchangeName: context.exchangeName,
          strategyName: context.strategyName,
          backtest: true,
          symbol,
        });
      }
      isDone = true;
    };
    task().catch((error) =>
      exitEmitter.next(new Error(getErrorMessage(error)))
    );
    return () => {
      backtest.strategyGlobalService.stop({symbol, strategyName: context.strategyName}, true);
      backtest.strategyGlobalService
        .getPendingSignal(symbol, context.strategyName)
        .then(async (pendingSignal) => {
          if (pendingSignal) {
            return;
          }
          if (!isDone) {
            await doneBacktestSubject.next({
              exchangeName: context.exchangeName,
              strategyName: context.strategyName,
              backtest: true,
              symbol,
            });
          }
          isDone = true;
        });
      isStopped = true;
    };
  };

  /**
   * Stops the strategy from generating new signals.
   *
   * Sets internal flag to prevent strategy from opening new signals.
   * Current active signal (if any) will complete normally.
   * Backtest will stop at the next safe point (idle state or after signal closes).
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to stop
   * @returns Promise that resolves when stop flag is set
   *
   * @example
   * ```typescript
   * const instance = new BacktestInstance();
   * await instance.stop("BTCUSDT", "my-strategy");
   * ```
   */
  public stop = async (symbol: string, strategyName: StrategyName): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_STOP, {
      symbol,
      strategyName,
    });
    await backtest.strategyGlobalService.stop({ symbol, strategyName }, true);
  };

  /**
   * Gets statistical data from all closed signals for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @returns Promise resolving to statistical data object
   *
   * @example
   * ```typescript
   * const instance = new BacktestInstance();
   * const stats = await instance.getData("BTCUSDT", "my-strategy");
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName) => {
    backtest.loggerService.info("BacktestUtils.getData", {
      symbol,
      strategyName,
    });
    return await backtest.backtestMarkdownService.getData(symbol, strategyName);
  };

  /**
   * Generates markdown report with all closed signals for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const instance = new BacktestInstance();
   * const markdown = await instance.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string, strategyName: StrategyName): Promise<string> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_REPORT, {
      symbol,
      strategyName,
    });
    return await backtest.backtestMarkdownService.getReport(symbol, strategyName);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./dump/backtest")
   *
   * @example
   * ```typescript
   * const instance = new BacktestInstance();
   * // Save to default path: ./dump/backtest/my-strategy.md
   * await instance.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await instance.dump("BTCUSDT", "my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    path?: string
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_DUMP, {
      symbol,
      strategyName,
      path,
    });
    await backtest.backtestMarkdownService.dump(symbol, strategyName, path);
  };
}

/**
 * Utility class for backtest operations.
 *
 * Provides simplified access to backtestCommandService.run() with logging.
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
   * Memoized function to get or create BacktestInstance for a symbol-strategy pair.
   * Each symbol-strategy combination gets its own isolated instance.
   */
  public getInstance = memoize<
    (symbol: string, strategyName: StrategyName) => BacktestInstance
  >(
    ([symbol, strategyName]) => `${symbol}:${strategyName}`,
    () => new BacktestInstance()
  );

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
    const instance = this.getInstance(symbol, context.strategyName);
    return instance.run(symbol, context);
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
  public background = (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    }
  ) => {
    const instance = this.getInstance(symbol, context.strategyName);
    return instance.background(symbol, context);
  };

  /**
   * Stops the strategy from generating new signals.
   *
   * Sets internal flag to prevent strategy from opening new signals.
   * Current active signal (if any) will complete normally.
   * Backtest will stop at the next safe point (idle state or after signal closes).
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to stop
   * @returns Promise that resolves when stop flag is set
   *
   * @example
   * ```typescript
   * // Stop strategy after some condition
   * await Backtest.stop("BTCUSDT", "my-strategy");
   * ```
   */
  public stop = async (symbol: string, strategyName: StrategyName): Promise<void> => {
    const instance = this.getInstance(symbol, strategyName);
    return instance.stop(symbol, strategyName);
  };

  /**
   * Gets statistical data from all closed signals for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @returns Promise resolving to statistical data object
   *
   * @example
   * ```typescript
   * const stats = await Backtest.getData("BTCUSDT", "my-strategy");
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName) => {
    const instance = this.getInstance(symbol, strategyName);
    return instance.getData(symbol, strategyName);
  };

  /**
   * Generates markdown report with all closed signals for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Backtest.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string, strategyName: StrategyName): Promise<string> => {
    const instance = this.getInstance(symbol, strategyName);
    return instance.getReport(symbol, strategyName);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./dump/backtest")
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/backtest/my-strategy.md
   * await Backtest.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await Backtest.dump("BTCUSDT", "my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    path?: string
  ): Promise<void> => {
    const instance = this.getInstance(symbol, strategyName);
    return instance.dump(symbol, strategyName, path);
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
