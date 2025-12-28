import {
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  StrategyName,
} from "../interfaces/Strategy.interface";
import backtest from "../lib";
import { exitEmitter, doneLiveSubject } from "../config/emitters";
import { getErrorMessage, memoize, randomString, singlerun } from "functools-kit";
import { Columns } from "../lib/services/markdown/LiveMarkdownService";

const LIVE_METHOD_NAME_RUN = "LiveUtils.run";
const LIVE_METHOD_NAME_BACKGROUND = "LiveUtils.background";
const LIVE_METHOD_NAME_STOP = "LiveUtils.stop";
const LIVE_METHOD_NAME_GET_REPORT = "LiveUtils.getReport";
const LIVE_METHOD_NAME_GET_DATA = "LiveUtils.getData";
const LIVE_METHOD_NAME_DUMP = "LiveUtils.dump";
const LIVE_METHOD_NAME_TASK = "LiveUtils.task";
const LIVE_METHOD_NAME_GET_STATUS = "LiveUtils.getStatus";

/**
 * Internal task function that runs live trading and handles completion.
 * Consumes live trading results and updates instance state flags.
 *
 * @param symbol - Trading pair symbol
 * @param context - Execution context with strategy and exchange names
 * @param self - LiveInstance reference for state management
 * @returns Promise that resolves when live trading completes
 *
 * @internal
 */
const INSTANCE_TASK_FN = async (
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
  },
  self: LiveInstance,
) => {
  {
    self._isStopped = false;
    self._isDone = false;
  }
  for await (const signal of self.run(symbol, context)) {
    if (signal?.action === "closed" && self._isStopped) {
      break;
    }
  }
  if (!self._isDone) {
    await doneLiveSubject.next({
      exchangeName: context.exchangeName,
      strategyName: context.strategyName,
      backtest: false,
      symbol,
    });
  }
  self._isDone = true;
}

/**
 * Instance class for live trading operations on a specific symbol-strategy pair.
 *
 * Provides isolated live trading execution and reporting for a single symbol-strategy combination.
 * Each instance maintains its own state and context.
 *
 * @example
 * ```typescript
 * const instance = new LiveInstance("BTCUSDT", "my-strategy");
 *
 * for await (const result of instance.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange"
 * })) {
 *   if (result.action === "closed") {
 *     console.log("Signal closed, PNL:", result.pnl.pnlPercentage);
 *   }
 * }
 * ```
 */
export class LiveInstance {
  /** A randomly generated string. */  
  readonly id = randomString();

  /** Internal flag indicating if live trading was stopped manually */
  _isStopped = false;

  /** Internal flag indicating if live trading task completed */
  _isDone = false;

  /**
   * Creates a new LiveInstance for a specific symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name for this live trading instance
   */
  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName
  ) { }

  /**
   * Internal singlerun task that executes the live trading.
   * Ensures only one live trading run per instance using singlerun wrapper.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategy and exchange names
   * @returns Promise that resolves when live trading completes
   *
   * @internal
   */
  private task = singlerun(async (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
    }
  ) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_TASK, {
      symbol,
      context,
    });
    return await INSTANCE_TASK_FN(symbol, context, this);
  })

  /**
   * Gets the current status of this live trading instance.
   *
   * @returns Promise resolving to status object with symbol, strategyName, and task status
   *
   * @example
   * ```typescript
   * const instance = new LiveInstance("BTCUSDT", "my-strategy");
   * const status = await instance.getStatus();
   * console.log(status.status); // "idle", "running", or "done"
   * ```
   */
  public getStatus = async () => {
    backtest.loggerService.info(LIVE_METHOD_NAME_GET_STATUS);
    return {
      id: this.id,
      symbol: this.symbol,
      strategyName: this.strategyName,
      status: this.task.getStatus(),
    }
  }

  /**
   * Runs live trading for a symbol with context propagation.
   *
   * Infinite async generator with crash recovery support.
   * Process can crash and restart - state will be recovered from disk.
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
    backtest.loggerService.info(LIVE_METHOD_NAME_RUN, {
      symbol,
      context,
    });

    {
      backtest.backtestMarkdownService.clear(false, { symbol, strategyName: context.strategyName });
      backtest.liveMarkdownService.clear(false, { symbol, strategyName: context.strategyName });
      backtest.scheduleMarkdownService.clear(false, { symbol, strategyName: context.strategyName });
      backtest.performanceMarkdownService.clear(false, { symbol, strategyName: context.strategyName });
      backtest.partialMarkdownService.clear(false, { symbol, strategyName: context.strategyName });
      backtest.riskMarkdownService.clear(false, { symbol, strategyName: context.strategyName });
    }

    {
      backtest.strategyCoreService.clear(false, { symbol, strategyName: context.strategyName });
    }

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(
        context.strategyName
      );
      riskName && backtest.riskGlobalService.clear(false, riskName);
      riskList && riskList.forEach((riskName) => backtest.riskGlobalService.clear(false, riskName));
    }

    return backtest.liveCommandService.run(symbol, context);
  };

  /**
   * Runs live trading in background without yielding results.
   *
   * Consumes all live trading results internally without exposing them.
   * Infinite loop - will run until process is stopped or crashes.
   * Useful for running live trading for side effects only (callbacks, persistence).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy and exchange names
   * @returns Cancellation closure
   *
   * @example
   * ```typescript
   * const instance = new LiveInstance();
   * const cancel = instance.background("BTCUSDT", {
   *   strategyName: "my-strategy",
   *   exchangeName: "my-exchange"
   * });
   * ```
   */
  public background = (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
    }
  ) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_BACKGROUND, {
      symbol,
      context,
    });
    const currentStatus = this.task.getStatus();
    {
      if (currentStatus === "pending") {
        throw new Error(`Live.background is already running for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName}`);
      }
      if (currentStatus === "rejected") {
        throw new Error(`Live.background has failed for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName}`);
      }
    }
    this.task(symbol, context).catch((error) =>
      exitEmitter.next(new Error(getErrorMessage(error)))
    );
    return () => {
      backtest.strategyCoreService.stop(false, {symbol, strategyName: context.strategyName});
      backtest.strategyCoreService
        .getPendingSignal(false, symbol, context.strategyName)
        .then(async (pendingSignal) => {
          if (pendingSignal) {
            return;
          }
          if (!this._isDone) {
            await doneLiveSubject.next({
              exchangeName: context.exchangeName,
              strategyName: context.strategyName,
              backtest: false,
              symbol,
            });
          }
          this._isDone = true;
        });
      this._isStopped = true;
    };
  };

  /**
   * Stops the strategy from generating new signals.
   *
   * Sets internal flag to prevent strategy from opening new signals.
   * Current active signal (if any) will complete normally.
   * Live trading will stop at the next safe point (idle/closed state).
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to stop
   * @returns Promise that resolves when stop flag is set
   *
   * @example
   * ```typescript
   * const instance = new LiveInstance();
   * await instance.stop("BTCUSDT", "my-strategy");
   * ```
   */
  public stop = async (symbol: string, strategyName: StrategyName): Promise<void> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_STOP, {
      symbol,
      strategyName,
    });
    await backtest.strategyCoreService.stop(false, { symbol, strategyName });
  };

  /**
   * Cancels the scheduled signal without stopping the strategy.
   *
   * Clears the scheduled signal (waiting for priceOpen activation).
   * Does NOT affect active pending signals or strategy operation.
   * Does NOT set stop flag - strategy can continue generating new signals.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name
   * @returns Promise that resolves when scheduled signal is cancelled
   *
   * @example
   * ```typescript
   * const instance = new LiveInstance();
   * await instance.cancel("BTCUSDT", "my-strategy");
   * ```
   */
  public cancel = async (symbol: string, strategyName: StrategyName): Promise<void> => {
    backtest.loggerService.info("LiveInstance.cancel", {
      symbol,
      strategyName,
    });
    await backtest.strategyCoreService.cancel(false, { symbol, strategyName });
  };

  /**
   * Gets statistical data from all live trading events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @returns Promise resolving to statistical data object
   *
   * @example
   * ```typescript
   * const instance = new LiveInstance();
   * const stats = await instance.getData("BTCUSDT", "my-strategy");
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName) => {
    backtest.loggerService.info("LiveUtils.getData", {
      symbol,
      strategyName,
    });
    return await backtest.liveMarkdownService.getData(symbol, strategyName, false);
  };

  /**
   * Generates markdown report with all events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param columns - Optional columns configuration for the report
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const instance = new LiveInstance();
   * const markdown = await instance.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string, strategyName: StrategyName, columns?: Columns[]): Promise<string> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_GET_REPORT, {
      symbol,
      strategyName,
    });
    return await backtest.liveMarkdownService.getReport(symbol, strategyName, false, columns);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./dump/live")
   * @param columns - Optional columns configuration for the report
   *
   * @example
   * ```typescript
   * const instance = new LiveInstance();
   * // Save to default path: ./dump/live/my-strategy.md
   * await instance.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await instance.dump("BTCUSDT", "my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    path?: string,
    columns?: Columns[]
  ): Promise<void> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_DUMP, {
      symbol,
      strategyName,
      path,
    });
    await backtest.liveMarkdownService.dump(symbol, strategyName, false, path, columns);
  };
}

/**
 * Utility class for live trading operations.
 *
 * Provides simplified access to liveCommandService.run() with logging.
 * Exported as singleton instance for convenient usage.
 *
 * Features:
 * - Infinite async generator (never completes)
 * - Crash recovery via persisted state
 * - Real-time progression with Date.now()
 *
 * @example
 * ```typescript
 * import { Live } from "./classes/Live";
 *
 * // Infinite loop - use Ctrl+C to stop
 * for await (const result of Live.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: ""
 * })) {
 *   if (result.action === "opened") {
 *     console.log("Signal opened:", result.signal);
 *   } else if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.pnlPercentage);
 *   }
 * }
 * ```
 */
export class LiveUtils {
  /**
   * Memoized function to get or create LiveInstance for a symbol-strategy pair.
   * Each symbol-strategy combination gets its own isolated instance.
   */
  private _getInstance = memoize<
    (symbol: string, strategyName: StrategyName) => LiveInstance
  >(
    ([symbol, strategyName]) => `${symbol}:${strategyName}`,
    (symbol: string, strategyName: StrategyName) => new LiveInstance(symbol, strategyName)
  );

  /**
   * Runs live trading for a symbol with context propagation.
   *
   * Infinite async generator with crash recovery support.
   * Process can crash and restart - state will be recovered from disk.
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
    {
      backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_RUN);
      backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_RUN);
    }

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_RUN);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_RUN));
    }

    const instance = this._getInstance(symbol, context.strategyName);
    return instance.run(symbol, context);
  };

  /**
   * Runs live trading in background without yielding results.
   *
   * Consumes all live trading results internally without exposing them.
   * Infinite loop - will run until process is stopped or crashes.
   * Useful for running live trading for side effects only (callbacks, persistence).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy and exchange names
   * @returns Cancellation closure
   *
   * @example
   * ```typescript
   * // Run live trading silently in background, only callbacks will fire
   * // This will run forever until Ctrl+C
   * await Live.background("BTCUSDT", {
   *   strategyName: "my-strategy",
   *   exchangeName: "my-exchange"
   * });
   * ```
   */
  public background = (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
    }
  ) => {
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_BACKGROUND);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_BACKGROUND);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_BACKGROUND);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_BACKGROUND));
    }

    const instance = this._getInstance(symbol, context.strategyName);
    return instance.background(symbol, context);
  };

  /**
   * Stops the strategy from generating new signals.
   *
   * Sets internal flag to prevent strategy from opening new signals.
   * Current active signal (if any) will complete normally.
   * Live trading will stop at the next safe point (idle/closed state).
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to stop
   * @returns Promise that resolves when stop flag is set
   *
   * @example
   * ```typescript
   * // Stop live trading gracefully
   * await Live.stop("BTCUSDT", "my-strategy");
   * ```
   */
  public stop = async (symbol: string, strategyName: StrategyName): Promise<void> => {
    backtest.strategyValidationService.validate(strategyName, LIVE_METHOD_NAME_STOP);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_STOP);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_STOP));
    }

    const instance = this._getInstance(symbol, strategyName);
    return await instance.stop(symbol, strategyName);
  };

  /**
   * Cancels the scheduled signal without stopping the strategy.
   *
   * Clears the scheduled signal (waiting for priceOpen activation).
   * Does NOT affect active pending signals or strategy operation.
   * Does NOT set stop flag - strategy can continue generating new signals.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name
   * @returns Promise that resolves when scheduled signal is cancelled
   *
   * @example
   * ```typescript
   * // Cancel scheduled signal in live trading
   * await Live.cancel("BTCUSDT", "my-strategy");
   * ```
   */
  public cancel = async (symbol: string, strategyName: StrategyName): Promise<void> => {
    backtest.strategyValidationService.validate(strategyName, "LiveUtils.cancel");

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, "LiveUtils.cancel");
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, "LiveUtils.cancel"));
    }

    const instance = this._getInstance(symbol, strategyName);
    return await instance.cancel(symbol, strategyName);
  };

  /**
   * Gets statistical data from all live trading events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @returns Promise resolving to statistical data object
   *
   * @example
   * ```typescript
   * const stats = await Live.getData("BTCUSDT", "my-strategy");
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName) => {
    backtest.strategyValidationService.validate(strategyName, "LiveUtils.getData");

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_DATA);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_DATA));
    }

    const instance = this._getInstance(symbol, strategyName);
    return await instance.getData(symbol, strategyName);
  };

  /**
   * Generates markdown report with all events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param columns - Optional columns configuration for the report
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Live.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string, strategyName: StrategyName, columns?: Columns[]): Promise<string> => {
    backtest.strategyValidationService.validate(strategyName, LIVE_METHOD_NAME_GET_REPORT);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_REPORT);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_REPORT));
    }

    const instance = this._getInstance(symbol, strategyName);
    return await instance.getReport(symbol, strategyName, columns);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./dump/live")
   * @param columns - Optional columns configuration for the report
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/live/my-strategy.md
   * await Live.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await Live.dump("BTCUSDT", "my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    path?: string,
    columns?: Columns[]
  ): Promise<void> => {
    backtest.strategyValidationService.validate(strategyName, LIVE_METHOD_NAME_DUMP);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_DUMP);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_DUMP));
    }

    const instance = this._getInstance(symbol, strategyName);
    return await instance.dump(symbol, strategyName, path, columns);
  };

  /**
   * Lists all active live trading instances with their current status.
   *
   * @returns Promise resolving to array of status objects for all instances
   *
   * @example
   * ```typescript
   * const statusList = await Live.list();
   * statusList.forEach(status => {
   *   console.log(`${status.symbol} - ${status.strategyName}: ${status.status}`);
   * });
   * ```
   */
  public list = async () => {
    const instanceList = this._getInstance.values();
    return await Promise.all(instanceList.map((instance) => instance.getStatus()));
  }
}

/**
 * Singleton instance of LiveUtils for convenient live trading operations.
 *
 * @example
 * ```typescript
 * import { Live } from "./classes/Live";
 *
 * for await (const result of Live.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 * })) {
 *   console.log("Result:", result.action);
 * }
 * ```
 */
export const Live = new LiveUtils();
