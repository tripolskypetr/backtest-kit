import backtest from "../lib";
import { WalkerName } from "../interfaces/Walker.interface";
import { exitEmitter, doneWalkerSubject, walkerStopSubject } from "../config/emitters";
import { getErrorMessage, memoize, singlerun } from "functools-kit";

const WALKER_METHOD_NAME_RUN = "WalkerUtils.run";
const WALKER_METHOD_NAME_BACKGROUND = "WalkerUtils.background";
const WALKER_METHOD_NAME_STOP = "WalkerUtils.stop";
const WALKER_METHOD_NAME_GET_DATA = "WalkerUtils.getData";
const WALKER_METHOD_NAME_GET_REPORT = "WalkerUtils.getReport";
const WALKER_METHOD_NAME_DUMP = "WalkerUtils.dump";
const WALKER_METHOD_NAME_TASK = "WalkerUtils.task";
const WALKER_METHOD_NAME_GET_STATUS = "WalkerUtils.getStatus";

/**
 * Internal task function that runs walker and handles completion.
 * Consumes walker results and updates instance state flags.
 *
 * @param symbol - Trading pair symbol
 * @param context - Execution context with walker name
 * @param self - WalkerInstance reference for state management
 * @returns Promise that resolves when walker completes
 *
 * @internal
 */
const INSTANCE_TASK_FN = async (
  symbol: string,
  context: {
    walkerName: string;
  },
  self: WalkerInstance,
) => {
  {
    self._isStopped = false;
    self._isDone = false;
  }
  for await (const _ of self.run(symbol, context)) {
    if (self._isStopped) {
      break;
    }
  }
  if (!self._isDone) {
    const walkerSchema = backtest.walkerSchemaService.get(context.walkerName);
    await doneWalkerSubject.next({
      exchangeName: walkerSchema.exchangeName,
      strategyName: context.walkerName,
      backtest: true,
      symbol,
    });
  }
  self._isDone = true;
}

/**
 * Instance class for walker operations on a specific symbol-walker pair.
 *
 * Provides isolated walker execution and reporting for a single symbol-walker combination.
 * Each instance maintains its own state and context.
 *
 * @example
 * ```typescript
 * const instance = new WalkerInstance("BTCUSDT", "my-walker");
 *
 * for await (const result of instance.run("BTCUSDT", {
 *   walkerName: "my-walker"
 * })) {
 *   console.log("Progress:", result.strategiesTested, "/", result.totalStrategies);
 * }
 * ```
 */
export class WalkerInstance {
  /** Internal flag indicating if walker was stopped manually */
  _isStopped = false;

  /** Internal flag indicating if walker task completed */
  _isDone = false;

  /**
   * Creates a new WalkerInstance for a specific symbol-walker pair.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param walkerName - Walker name for this walker instance
   */
  constructor(
    readonly symbol: string,
    readonly walkerName: WalkerName
  ) { }

  /**
   * Internal singlerun task that executes the walker.
   * Ensures only one walker run per instance using singlerun wrapper.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with walker name
   * @returns Promise that resolves when walker completes
   *
   * @internal
   */
  private task = singlerun(async (
    symbol: string,
    context: {
      walkerName: string;
    }
  ) => {
    backtest.loggerService.info(WALKER_METHOD_NAME_TASK, {
      symbol,
      context,
    });
    return await INSTANCE_TASK_FN(symbol, context, this);
  })

  /**
   * Gets the current status of this walker instance.
   *
   * @returns Promise resolving to status object with symbol, walkerName, and task status
   *
   * @example
   * ```typescript
   * const instance = new WalkerInstance("BTCUSDT", "my-walker");
   * const status = await instance.getStatus();
   * console.log(status.status); // "idle", "running", or "done"
   * ```
   */
  public getStatus = async () => {
    backtest.loggerService.info(WALKER_METHOD_NAME_GET_STATUS);
    return {
      symbol: this.symbol,
      walkerName: this.walkerName,
      status: this.task.getStatus(),
    }
  }

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
        backtest.backtestMarkdownService.clear({ symbol, strategyName });
        backtest.scheduleMarkdownService.clear({ symbol, strategyName });
      }

      {
        backtest.strategyGlobalService.clear({ symbol, strategyName });
      }

      {
        const { riskName } = backtest.strategySchemaService.get(strategyName);
        riskName && backtest.riskGlobalService.clear(riskName);
      }

    }

    return backtest.walkerCommandService.run(symbol, {
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
   * const instance = new WalkerInstance();
   * const cancel = instance.background("BTCUSDT", {
   *   walkerName: "my-walker"
   * });
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

    this.task(symbol, context).catch((error) =>
      exitEmitter.next(new Error(getErrorMessage(error)))
    );
    return () => {
      for (const strategyName of walkerSchema.strategies) {
        backtest.strategyGlobalService.stop({symbol, strategyName}, true);
        walkerStopSubject.next({ symbol, strategyName, walkerName: context.walkerName });
      }
      if (!this._isDone) {
        doneWalkerSubject.next({
          exchangeName: walkerSchema.exchangeName,
          strategyName: context.walkerName,
          backtest: true,
          symbol,
        });
      }
      this._isDone = true;
      this._isStopped = true;
    };
  };

  /**
   * Stops all strategies in the walker from generating new signals.
   *
   * Iterates through all strategies defined in walker schema and:
   * 1. Sends stop signal via walkerStopSubject (interrupts current running strategy)
   * 2. Sets internal stop flag for each strategy (prevents new signals)
   *
   * Current active signals (if any) will complete normally.
   * Walker will stop at the next safe point.
   *
   * Supports multiple walkers running on the same symbol simultaneously.
   * Stop signal is filtered by walkerName to prevent interference.
   *
   * @param symbol - Trading pair symbol
   * @param walkerName - Walker name to stop
   * @returns Promise that resolves when all stop flags are set
   *
   * @example
   * ```typescript
   * const instance = new WalkerInstance();
   * await instance.stop("BTCUSDT", "my-walker");
   * ```
   */
  public stop = async (symbol: string, walkerName: WalkerName): Promise<void> => {
    backtest.loggerService.info(WALKER_METHOD_NAME_STOP, {
      symbol,
      walkerName,
    });

    const walkerSchema = backtest.walkerSchemaService.get(walkerName);

    for (const strategyName of walkerSchema.strategies) {
      await walkerStopSubject.next({ symbol, strategyName, walkerName });
      await backtest.strategyGlobalService.stop({ symbol, strategyName }, true);
    }
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
   * const instance = new WalkerInstance();
   * const results = await instance.getData("BTCUSDT", "my-walker");
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
   * const instance = new WalkerInstance();
   * const markdown = await instance.getReport("BTCUSDT", "my-walker");
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
   * @param path - Optional directory path to save report (default: "./dump/walker")
   *
   * @example
   * ```typescript
   * const instance = new WalkerInstance();
   * // Save to default path: ./dump/walker/my-walker.md
   * await instance.dump("BTCUSDT", "my-walker");
   *
   * // Save to custom path: ./custom/path/my-walker.md
   * await instance.dump("BTCUSDT", "my-walker", "./custom/path");
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
 * Utility class for walker operations.
 *
 * Provides simplified access to walkerCommandService.run() with logging.
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
   * Memoized function to get or create WalkerInstance for a symbol-walker pair.
   * Each symbol-walker combination gets its own isolated instance.
   */
  private _getInstance = memoize<
    (symbol: string, walkerName: WalkerName) => WalkerInstance
  >(
    ([symbol, walkerName]) => `${symbol}:${walkerName}`,
    (symbol: string, walkerName: WalkerName) => new WalkerInstance(symbol, walkerName)
  );

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
    const instance = this._getInstance(symbol, context.walkerName);
    return instance.run(symbol, context);
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
    const instance = this._getInstance(symbol, context.walkerName);
    return instance.background(symbol, context);
  };

  /**
   * Stops all strategies in the walker from generating new signals.
   *
   * Iterates through all strategies defined in walker schema and:
   * 1. Sends stop signal via walkerStopSubject (interrupts current running strategy)
   * 2. Sets internal stop flag for each strategy (prevents new signals)
   *
   * Current active signals (if any) will complete normally.
   * Walker will stop at the next safe point.
   *
   * Supports multiple walkers running on the same symbol simultaneously.
   * Stop signal is filtered by walkerName to prevent interference.
   *
   * @param symbol - Trading pair symbol
   * @param walkerName - Walker name to stop
   * @returns Promise that resolves when all stop flags are set
   *
   * @example
   * ```typescript
   * // Stop walker and all its strategies
   * await Walker.stop("BTCUSDT", "my-walker");
   * ```
   */
  public stop = async (symbol: string, walkerName: WalkerName): Promise<void> => {
    const instance = this._getInstance(symbol, walkerName);
    return await instance.stop(symbol, walkerName);
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
    const instance = this._getInstance(symbol, walkerName);
    return await instance.getData(symbol, walkerName);
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
    const instance = this._getInstance(symbol, walkerName);
    return await instance.getReport(symbol, walkerName);
  };

  /**
   * Saves walker report to disk.
   *
   * @param symbol - Trading symbol
   * @param walkerName - Walker name to save report for
   * @param path - Optional directory path to save report (default: "./dump/walker")
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/walker/my-walker.md
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
    const instance = this._getInstance(symbol, walkerName);
    return await instance.dump(symbol, walkerName, path);
  };

  /**
   * Lists all active walker instances with their current status.
   *
   * @returns Promise resolving to array of status objects for all instances
   *
   * @example
   * ```typescript
   * const statusList = await Walker.list();
   * statusList.forEach(status => {
   *   console.log(`${status.symbol} - ${status.walkerName}: ${status.status}`);
   * });
   * ```
   */
  public list = async () => {
    const instanceList = this._getInstance.values();
    return await Promise.all(instanceList.map((instance) => instance.getStatus()));
  }
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
