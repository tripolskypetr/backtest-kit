import backtest from "../lib";
import { StrategyName } from "../interfaces/Strategy.interface";
import { exitEmitter, doneBacktestSubject } from "../config/emitters";
import {
  getErrorMessage,
  memoize,
  randomString,
  singlerun,
} from "functools-kit";
import { Columns } from "../lib/services/markdown/BacktestMarkdownService";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

const BACKTEST_METHOD_NAME_RUN = "BacktestUtils.run";
const BACKTEST_METHOD_NAME_BACKGROUND = "BacktestUtils.background";
const BACKTEST_METHOD_NAME_STOP = "BacktestUtils.stop";
const BACKTEST_METHOD_NAME_GET_REPORT = "BacktestUtils.getReport";
const BACKTEST_METHOD_NAME_DUMP = "BacktestUtils.dump";
const BACKTEST_METHOD_NAME_TASK = "BacktestUtils.task";
const BACKTEST_METHOD_NAME_GET_STATUS = "BacktestUtils.getStatus";
const BACKTEST_METHOD_NAME_GET_PENDING_SIGNAL =
  "BacktestUtils.getPendingSignal";
const BACKTEST_METHOD_NAME_GET_SCHEDULED_SIGNAL =
  "BacktestUtils.getScheduledSignal";
const BACKTEST_METHOD_NAME_GET_BREAKEVEN = "BacktestUtils.getBreakeven";
const BACKTEST_METHOD_NAME_CANCEL = "BacktestUtils.cancel";
const BACKTEST_METHOD_NAME_PARTIAL_PROFIT = "BacktestUtils.partialProfit";
const BACKTEST_METHOD_NAME_PARTIAL_LOSS = "BacktestUtils.partialLoss";
const BACKTEST_METHOD_NAME_TRAILING_STOP = "BacktestUtils.trailingStop";
const BACKTEST_METHOD_NAME_TRAILING_PROFIT = "BacktestUtils.trailingTake";
const BACKTEST_METHOD_NAME_GET_DATA = "BacktestUtils.getData";

/**
 * Internal task function that runs backtest and handles completion.
 * Consumes backtest results and updates instance state flags.
 *
 * @param symbol - Trading pair symbol
 * @param context - Execution context with strategy, exchange, and frame names
 * @param self - BacktestInstance reference for state management
 * @returns Promise that resolves when backtest completes
 *
 * @internal
 */
const INSTANCE_TASK_FN = async (
  symbol: string,
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
  },
  self: BacktestInstance
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
    await doneBacktestSubject.next({
      exchangeName: context.exchangeName,
      strategyName: context.strategyName,
      frameName: context.frameName,
      backtest: true,
      symbol,
    });
  }
  self._isDone = true;
};

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
  /** A randomly generated string. */
  readonly id = randomString();

  /** Internal flag indicating if backtest was stopped manually */
  _isStopped = false;

  /** Internal flag indicating if backtest task completed */
  _isDone = false;

  /**
   * Creates a new BacktestInstance for a specific symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name for this backtest instance
   */
  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName
  ) {}

  /**
   * Internal singlerun task that executes the backtest.
   * Ensures only one backtest run per instance using singlerun wrapper.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategy, exchange, and frame names
   * @returns Promise that resolves when backtest completes
   *
   * @internal
   */
  private task = singlerun(
    async (
      symbol: string,
      context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName: FrameName;
      }
    ) => {
      backtest.loggerService.info(BACKTEST_METHOD_NAME_TASK, {
        symbol,
        context,
      });
      return await INSTANCE_TASK_FN(symbol, context, this);
    }
  );

  /**
   * Gets the current status of this backtest instance.
   *
   * @returns Promise resolving to status object with symbol, strategyName, and task status
   *
   * @example
   * ```typescript
   * const instance = new BacktestInstance("BTCUSDT", "my-strategy");
   * const status = await instance.getStatus();
   * console.log(status.status); // "idle", "running", or "done"
   * ```
   */
  public getStatus = async () => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_STATUS);
    return {
      id: this.id,
      symbol: this.symbol,
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      status: this.task.getStatus(),
    };
  };

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
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_RUN, {
      symbol,
      context,
    });

    {
      backtest.backtestMarkdownService.clear({
        symbol,
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: true,
      });
      backtest.liveMarkdownService.clear({
        symbol,
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: true,
      });
      backtest.scheduleMarkdownService.clear({
        symbol,
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: true,
      });
      backtest.performanceMarkdownService.clear({
        symbol,
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: true,
      });
      backtest.partialMarkdownService.clear({
        symbol,
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: true,
      });
      backtest.riskMarkdownService.clear({
        symbol,
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: true,
      });
    }

    {
      backtest.strategyCoreService.clear({
        symbol,
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: true,
      });
    }

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(
        context.strategyName
      );
      riskName && backtest.riskGlobalService.clear({
        riskName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: true,
      });
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskGlobalService.clear({
            riskName,
            exchangeName: context.exchangeName,
            frameName: context.frameName,
            backtest: true,
          })
        );
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
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_BACKGROUND, {
      symbol,
      context,
    });
    {
      const currentStatus = this.task.getStatus();
      if (currentStatus === "pending") {
        throw new Error(
          `Backtest.background is already running for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`
        );
      }
      if (currentStatus === "rejected") {
        throw new Error(
          `Backtest.background has failed for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`
        );
      }
    }
    this.task(symbol, context).catch((error) =>
      exitEmitter.next(new Error(getErrorMessage(error)))
    );
    return () => {
      backtest.strategyCoreService.stop(true, symbol, {
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
      });
      backtest.strategyCoreService
        .getPendingSignal(true, symbol, {
          strategyName: context.strategyName,
          exchangeName: context.exchangeName,
          frameName: context.frameName,
        })
        .then(async (pendingSignal) => {
          if (pendingSignal) {
            return;
          }
          if (!this._isDone) {
            await doneBacktestSubject.next({
              exchangeName: context.exchangeName,
              strategyName: context.strategyName,
              frameName: context.frameName,
              backtest: true,
              symbol,
            });
          }
          this._isDone = true;
        });
      this._isStopped = true;
    };
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
  private _getInstance = memoize(
    ([symbol, strategyName, exchangeName, frameName]) =>
      `${symbol}:${strategyName}:${exchangeName}:${frameName}`,
    (
      symbol: string,
      strategyName: StrategyName,
      exchangeName: ExchangeName,
      frameName: FrameName
    ) => new BacktestInstance(symbol, strategyName, exchangeName, frameName)
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
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    {
      backtest.strategyValidationService.validate(
        context.strategyName,
        BACKTEST_METHOD_NAME_RUN
      );
      backtest.exchangeValidationService.validate(
        context.exchangeName,
        BACKTEST_METHOD_NAME_RUN
      );
      backtest.frameValidationService.validate(
        context.frameName,
        BACKTEST_METHOD_NAME_RUN
      );
    }

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(
        context.strategyName
      );
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_RUN
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_RUN
          )
        );
    }

    const instance = this._getInstance(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName
    );
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
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_BACKGROUND
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_BACKGROUND
    );
    backtest.frameValidationService.validate(
      context.frameName,
      BACKTEST_METHOD_NAME_BACKGROUND
    );

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(
        context.strategyName
      );
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_BACKGROUND
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_BACKGROUND
          )
        );
    }

    const instance = this._getInstance(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName
    );
    return instance.background(symbol, context);
  };

  /**
   * Retrieves the currently active pending signal for the strategy.
   * If no active signal exists, returns null.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of strategy to get pending signal for
   * @returns Promise resolving to pending signal or null
   *
   * @example
   * ```typescript
   * const pending = await Backtest.getPendingSignal("BTCUSDT", "my-strategy");
   * if (pending) {
   *   console.log("Active signal:", pending.id);
   * }
   * ```
   */
  public getPendingSignal = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_PENDING_SIGNAL, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_PENDING_SIGNAL
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_PENDING_SIGNAL
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_PENDING_SIGNAL
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_PENDING_SIGNAL
          )
        );
    }

    return await backtest.strategyCoreService.getPendingSignal(
      true,
      symbol,
      context
    );
  };

  /**
   * Retrieves the currently active scheduled signal for the strategy.
   * If no scheduled signal exists, returns null.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of strategy to get scheduled signal for
   * @returns Promise resolving to scheduled signal or null
   *
   * @example
   * ```typescript
   * const scheduled = await Backtest.getScheduledSignal("BTCUSDT", "my-strategy");
   * if (scheduled) {
   *   console.log("Scheduled signal:", scheduled.id);
   * }
   * ```
   */
  public getScheduledSignal = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_SCHEDULED_SIGNAL, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_SCHEDULED_SIGNAL
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_SCHEDULED_SIGNAL
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_SCHEDULED_SIGNAL
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_SCHEDULED_SIGNAL
          )
        );
    }

    return await backtest.strategyCoreService.getScheduledSignal(
      true,
      symbol,
      context
    );
  };

  /**
   * Checks if breakeven threshold has been reached for the current pending signal.
   *
   * Uses the same formula as BREAKEVEN_FN to determine if price has moved far enough
   * to cover transaction costs (slippage + fees) and allow breakeven to be set.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price to check against threshold
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if breakeven threshold reached, false otherwise
   *
   * @example
   * ```typescript
   * const canBreakeven = await Backtest.getBreakeven("BTCUSDT", 100.5, {
   *   strategyName: "my-strategy",
   *   exchangeName: "binance", 
   *   frameName: "backtest_frame"
   * });
   * if (canBreakeven) {
   *   console.log("Breakeven threshold reached");
   *   await Backtest.breakeven("BTCUSDT", 100.5, context);
   * }
   * ```
   */
  public getBreakeven = async (
    symbol: string,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_BREAKEVEN, {
      symbol,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_BREAKEVEN
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_BREAKEVEN
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_BREAKEVEN
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_BREAKEVEN
          )
        );
    }

    return await backtest.strategyCoreService.getBreakeven(
      true,
      symbol,
      currentPrice,
      context
    );
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
   * @param context - Execution context with exchangeName and frameName
   * @returns Promise that resolves when stop flag is set
   *
   * @example
   * ```typescript
   * // Stop strategy after some condition
   * await Backtest.stop("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * ```
   */
  public stop = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_STOP, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_STOP
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_STOP
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_STOP
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_STOP
          )
        );
    }

    await backtest.strategyCoreService.stop(true, symbol, context);
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
   * @param context - Execution context with exchangeName and frameName
   * @param cancelId - Optional cancellation ID for tracking user-initiated cancellations
   * @returns Promise that resolves when scheduled signal is cancelled
   *
   * @example
   * ```typescript
   * // Cancel scheduled signal with custom ID
   * await Backtest.cancel("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * }, "manual-cancel-001");
   * ```
   */
  public cancel = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    cancelId?: string
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_CANCEL, {
      symbol,
      context,
      cancelId,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_CANCEL
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_CANCEL
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_CANCEL
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_CANCEL
          )
        );
    }

    await backtest.strategyCoreService.cancel(
      true,
      symbol,
      context,
      cancelId
    );
  };

  /**
   * Executes partial close at profit level (moving toward TP).
   *
   * Closes a percentage of the active pending position at profit.
   * Price must be moving toward take profit (in profit direction).
   *
   * @param symbol - Trading pair symbol
   * @param percentToClose - Percentage of position to close (0-100, absolute value)
   * @param currentPrice - Current market price for this partial close
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Promise that resolves when state is updated
   *
   * @throws Error if currentPrice is not in profit direction:
   *   - LONG: currentPrice must be > priceOpen
   *   - SHORT: currentPrice must be < priceOpen
   *
   * @example
   * ```typescript
   * // Close 30% of LONG position at profit
   * await Backtest.partialProfit("BTCUSDT", 30, 45000, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * ```
   */
  public partialProfit = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_PARTIAL_PROFIT, {
      symbol,
      percentToClose,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_PARTIAL_PROFIT
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_PARTIAL_PROFIT
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_PARTIAL_PROFIT
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_PARTIAL_PROFIT
          )
        );
    }

    await backtest.strategyCoreService.partialProfit(
      true,
      symbol,
      percentToClose,
      currentPrice,
      context
    );
  };

  /**
   * Executes partial close at loss level (moving toward SL).
   *
   * Closes a percentage of the active pending position at loss.
   * Price must be moving toward stop loss (in loss direction).
   *
   * @param symbol - Trading pair symbol
   * @param percentToClose - Percentage of position to close (0-100, absolute value)
   * @param currentPrice - Current market price for this partial close
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Promise that resolves when state is updated
   *
   * @throws Error if currentPrice is not in loss direction:
   *   - LONG: currentPrice must be < priceOpen
   *   - SHORT: currentPrice must be > priceOpen
   *
   * @example
   * ```typescript
   * // Close 40% of LONG position at loss
   * await Backtest.partialLoss("BTCUSDT", 40, 38000, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * ```
   */
  public partialLoss = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_PARTIAL_LOSS, {
      symbol,
      percentToClose,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_PARTIAL_LOSS
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_PARTIAL_LOSS
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_PARTIAL_LOSS
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_PARTIAL_LOSS
          )
        );
    }

    await backtest.strategyCoreService.partialLoss(
      true,
      symbol,
      percentToClose,
      currentPrice,
      context
    );
  };

  /**
   * Adjusts the trailing stop-loss distance for an active pending signal.
   *
   * CRITICAL: Always calculates from ORIGINAL SL, not from current trailing SL.
   * This prevents error accumulation on repeated calls.
   * Larger percentShift ABSORBS smaller one (updates only towards better protection).
   *
   * Updates the stop-loss distance by a percentage adjustment relative to the ORIGINAL SL distance.
   * Negative percentShift tightens the SL (reduces distance, moves closer to entry).
   * Positive percentShift loosens the SL (increases distance, moves away from entry).
   *
   * Absorption behavior:
   * - First call: sets trailing SL unconditionally
   * - Subsequent calls: updates only if new SL is BETTER (protects more profit)
   * - For LONG: only accepts HIGHER SL (never moves down, closer to entry wins)
   * - For SHORT: only accepts LOWER SL (never moves up, closer to entry wins)
   *
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to ORIGINAL SL distance (-100 to 100)
   * @param currentPrice - Current market price to check for intrusion
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Promise that resolves when trailing SL is updated
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalSL=90, distance=10%, currentPrice=102
   *
   * // First call: tighten by 5%
   * await Backtest.trailingStop("BTCUSDT", -5, 102, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * // newDistance = 10% - 5% = 5%, newSL = 95
   *
   * // Second call: try weaker protection (smaller percentShift)
   * await Backtest.trailingStop("BTCUSDT", -3, 102, context);
   * // SKIPPED: newSL=97 < 95 (worse protection, larger % absorbs smaller)
   *
   * // Third call: stronger protection (larger percentShift)
   * await Backtest.trailingStop("BTCUSDT", -7, 102, context);
   * // ACCEPTED: newDistance = 10% - 7% = 3%, newSL = 97 > 95 (better protection)
   * ```
   */
  public trailingStop = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_TRAILING_STOP, {
      symbol,
      percentShift,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_TRAILING_STOP
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_TRAILING_STOP
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_TRAILING_STOP
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_TRAILING_STOP
          )
        );
    }

    return await backtest.strategyCoreService.trailingStop(
      true,
      symbol,
      percentShift,
      currentPrice,
      context
    );
  };

  /**
   * Adjusts the trailing take-profit distance for an active pending signal.
   *
   * CRITICAL: Always calculates from ORIGINAL TP, not from current trailing TP.
   * This prevents error accumulation on repeated calls.
   * Larger percentShift ABSORBS smaller one (updates only towards more conservative TP).
   *
   * Updates the take-profit distance by a percentage adjustment relative to the ORIGINAL TP distance.
   * Negative percentShift brings TP closer to entry (more conservative).
   * Positive percentShift moves TP further from entry (more aggressive).
   *
   * Absorption behavior:
   * - First call: sets trailing TP unconditionally
   * - Subsequent calls: updates only if new TP is MORE CONSERVATIVE (closer to entry)
   * - For LONG: only accepts LOWER TP (never moves up, closer to entry wins)
   * - For SHORT: only accepts HIGHER TP (never moves down, closer to entry wins)
   *
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to ORIGINAL TP distance (-100 to 100)
   * @param currentPrice - Current market price to check for intrusion
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Promise that resolves when trailing TP is updated
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalTP=110, distance=10%, currentPrice=102
   *
   * // First call: bring TP closer by 3%
   * await Backtest.trailingTake("BTCUSDT", -3, 102, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * // newDistance = 10% - 3% = 7%, newTP = 107
   *
   * // Second call: try to move TP further (less conservative)
   * await Backtest.trailingTake("BTCUSDT", 2, 102, context);
   * // SKIPPED: newTP=112 > 107 (less conservative, larger % absorbs smaller)
   *
   * // Third call: even more conservative
   * await Backtest.trailingTake("BTCUSDT", -5, 102, context);
   * // ACCEPTED: newDistance = 10% - 5% = 5%, newTP = 105 < 107 (more conservative)
   * ```
   */
  public trailingTake = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_TRAILING_PROFIT, {
      symbol,
      percentShift,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_TRAILING_PROFIT
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_TRAILING_PROFIT
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_TRAILING_PROFIT
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_TRAILING_PROFIT
          )
        );
    }

    return await backtest.strategyCoreService.trailingTake(
      true,
      symbol,
      percentShift,
      currentPrice,
      context
    );
  };

  /**
   * Moves stop-loss to breakeven when price reaches threshold.
   *
   * Moves SL to entry price (zero-risk position) when current price has moved
   * far enough in profit direction. Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price to check threshold
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if breakeven was set, false otherwise
   *
   * @example
   * ```typescript
   * const moved = await Backtest.breakeven(
   *   "BTCUSDT",
   *   112,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" }
   * );
   * console.log(moved); // true (SL moved to entry price)
   * ```
   */
  public breakeven = async (
    symbol: string,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info("Backtest.breakeven", {
      symbol,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      "Backtest.breakeven"
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      "Backtest.breakeven"
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          "Backtest.breakeven"
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            "Backtest.breakeven"
          )
        );
    }

    return await backtest.strategyCoreService.breakeven(
      true,
      symbol,
      currentPrice,
      context
    );
  };

  /**
   * Gets statistical data from all closed signals for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @param context - Execution context with exchangeName and frameName
   * @returns Promise resolving to statistical data object
   *
   * @example
   * ```typescript
   * const stats = await Backtest.getData("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_DATA, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_DATA
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_DATA
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_DATA
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_DATA
          )
        );
    }

    return await backtest.backtestMarkdownService.getData(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      true
    );
  };

  /**
   * Generates markdown report with all closed signals for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param context - Execution context with exchangeName and frameName
   * @param columns - Optional columns configuration for the report
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Backtest.getReport("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    columns?: Columns[]
  ): Promise<string> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_REPORT, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_REPORT
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_REPORT
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_REPORT
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_REPORT
          )
        );
    }

    return await backtest.backtestMarkdownService.getReport(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      true,
      columns
    );
  };

  /**
   * Saves strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param context - Execution context with exchangeName and frameName
   * @param path - Optional directory path to save report (default: "./dump/backtest")
   * @param columns - Optional columns configuration for the report
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/backtest/my-strategy.md
   * await Backtest.dump("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await Backtest.dump("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * }, "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    path?: string,
    columns?: Columns[]
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_DUMP, {
      symbol,
      context,
      path,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_DUMP
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_DUMP
    );

    {
      const { riskName, riskList } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_DUMP
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_DUMP
          )
        );
    }

    await backtest.backtestMarkdownService.dump(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      true,
      path,
      columns
    );
  };

  /**
   * Lists all active backtest instances with their current status.
   *
   * @returns Promise resolving to array of status objects for all instances
   *
   * @example
   * ```typescript
   * const statusList = await Backtest.list();
   * statusList.forEach(status => {
   *   console.log(`${status.symbol} - ${status.strategyName}: ${status.status}`);
   * });
   * ```
   */
  public list = async () => {
    const instanceList = this._getInstance.values();
    return await Promise.all(
      instanceList.map((instance) => instance.getStatus())
    );
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
