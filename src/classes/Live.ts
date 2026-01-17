import {
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  StrategyName,
} from "../interfaces/Strategy.interface";
import backtest from "../lib";
import { exitEmitter, doneLiveSubject } from "../config/emitters";
import { getErrorMessage, memoize, randomString, singlerun } from "functools-kit";
import { Columns } from "../lib/services/markdown/LiveMarkdownService";
import { ExchangeName } from "../interfaces/Exchange.interface";

const LIVE_METHOD_NAME_RUN = "LiveUtils.run";
const LIVE_METHOD_NAME_BACKGROUND = "LiveUtils.background";
const LIVE_METHOD_NAME_STOP = "LiveUtils.stop";
const LIVE_METHOD_NAME_GET_REPORT = "LiveUtils.getReport";
const LIVE_METHOD_NAME_GET_DATA = "LiveUtils.getData";
const LIVE_METHOD_NAME_DUMP = "LiveUtils.dump";
const LIVE_METHOD_NAME_TASK = "LiveUtils.task";
const LIVE_METHOD_NAME_GET_STATUS = "LiveUtils.getStatus";
const LIVE_METHOD_NAME_GET_PENDING_SIGNAL = "LiveUtils.getPendingSignal";
const LIVE_METHOD_NAME_GET_SCHEDULED_SIGNAL = "LiveUtils.getScheduledSignal";
const LIVE_METHOD_NAME_GET_BREAKEVEN = "LiveUtils.getBreakeven";
const LIVE_METHOD_NAME_CANCEL = "LiveUtils.cancel";
const LIVE_METHOD_NAME_PARTIAL_PROFIT = "LiveUtils.partialProfit";
const LIVE_METHOD_NAME_PARTIAL_LOSS = "LiveUtils.partialLoss";
const LIVE_METHOD_NAME_TRAILING_STOP = "LiveUtils.trailingStop";
const LIVE_METHOD_NAME_TRAILING_PROFIT = "LiveUtils.trailingTake";

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
    strategyName: StrategyName;
    exchangeName: ExchangeName;
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
      frameName: "",
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
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName
  ) {}

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
      strategyName: StrategyName;
      exchangeName: ExchangeName;
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
      exchangeName: this.exchangeName,
      status: this.task.getStatus(),
    };
  };

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
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_RUN, {
      symbol,
      context,
    });

    {
      backtest.backtestMarkdownService.clear({ symbol, strategyName: context.strategyName, exchangeName: context.exchangeName, frameName: "", backtest: false });
      backtest.liveMarkdownService.clear({ symbol, strategyName: context.strategyName, exchangeName: context.exchangeName, frameName: "", backtest: false });
      backtest.scheduleMarkdownService.clear({ symbol, strategyName: context.strategyName, exchangeName: context.exchangeName, frameName: "", backtest: false });
      backtest.performanceMarkdownService.clear({ symbol, strategyName: context.strategyName, exchangeName: context.exchangeName, frameName: "", backtest: false });
      backtest.partialMarkdownService.clear({ symbol, strategyName: context.strategyName, exchangeName: context.exchangeName, frameName: "", backtest: false });
      backtest.riskMarkdownService.clear({ symbol, strategyName: context.strategyName, exchangeName: context.exchangeName, frameName: "", backtest: false });
    }

    {
      backtest.strategyCoreService.clear({
        symbol,
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: "",
        backtest: false,
      });
    }

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(
        context.strategyName
      );
      riskName && backtest.riskGlobalService.clear({
        riskName,
        exchangeName: context.exchangeName,
        frameName: "",
        backtest: false
      });
      riskList && riskList.forEach((riskName) => backtest.riskGlobalService.clear({
        riskName,
        exchangeName: context.exchangeName,
        frameName: "",
        backtest: false
      }));
      actions && actions.forEach((actionName) => backtest.actionCoreService.clear({
        actionName,
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: "",
        backtest: false
      }));
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
      strategyName: StrategyName;
      exchangeName: ExchangeName;
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
      backtest.strategyCoreService.stop(false, symbol, {
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: ""
      });
      backtest.strategyCoreService
        .getPendingSignal(false, symbol, {
          strategyName: context.strategyName,
          exchangeName: context.exchangeName,
          frameName: "",
        })
        .then(async (pendingSignal) => {
          if (pendingSignal) {
            return;
          }
          if (!this._isDone) {
            await doneLiveSubject.next({
              exchangeName: context.exchangeName,
              strategyName: context.strategyName,
              frameName: "",
              backtest: false,
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
  private _getInstance = memoize(
    ([symbol, strategyName, exchangeName]) =>
      `${symbol}:${strategyName}:${exchangeName}`,
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName) =>
      new LiveInstance(symbol, strategyName, exchangeName)
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
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ) => {
    {
      backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_RUN);
      backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_RUN);
    }

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_RUN);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_RUN));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_RUN));
    }

    const instance = this._getInstance(symbol, context.strategyName, context.exchangeName);
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
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ) => {
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_BACKGROUND);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_BACKGROUND);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_BACKGROUND);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_BACKGROUND));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_BACKGROUND));
    }

    const instance = this._getInstance(symbol, context.strategyName, context.exchangeName);
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
   * const pending = await Live.getPendingSignal("BTCUSDT", "my-strategy");
   * if (pending) {
   *   console.log("Active signal:", pending.id);
   * }
   * ```
   */
  public getPendingSignal = async (symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; }) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_GET_PENDING_SIGNAL, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_GET_PENDING_SIGNAL);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_GET_PENDING_SIGNAL);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_PENDING_SIGNAL);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_PENDING_SIGNAL));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_GET_PENDING_SIGNAL));
    }

    return await backtest.strategyCoreService.getPendingSignal(false, symbol, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    });
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
   * const scheduled = await Live.getScheduledSignal("BTCUSDT", "my-strategy");
   * if (scheduled) {
   *   console.log("Scheduled signal:", scheduled.id);
   * }
   * ```
   */
  public getScheduledSignal = async (symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; }) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_GET_SCHEDULED_SIGNAL, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_GET_SCHEDULED_SIGNAL);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_GET_SCHEDULED_SIGNAL);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_SCHEDULED_SIGNAL);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_SCHEDULED_SIGNAL));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_GET_SCHEDULED_SIGNAL));
    }

    return await backtest.strategyCoreService.getScheduledSignal(false, symbol, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    });
  };

  /**
   * Checks if breakeven threshold has been reached for the current pending signal.
   *
   * Uses the same formula as BREAKEVEN_FN to determine if price has moved far enough
   * to cover transaction costs (slippage + fees) and allow breakeven to be set.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price to check against threshold
   * @param context - Execution context with strategyName and exchangeName
   * @returns Promise<boolean> - true if breakeven threshold reached, false otherwise
   *
   * @example
   * ```typescript
   * const canBreakeven = await Live.getBreakeven("BTCUSDT", 100.5, {
   *   strategyName: "my-strategy",
   *   exchangeName: "binance"
   * });
   * if (canBreakeven) {
   *   console.log("Breakeven threshold reached");
   *   await Live.breakeven("BTCUSDT", 100.5, context);
   * }
   * ```
   */
  public getBreakeven = async (
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; }
  ): Promise<boolean> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_GET_BREAKEVEN, {
      symbol,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_GET_BREAKEVEN);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_GET_BREAKEVEN);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_BREAKEVEN);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_BREAKEVEN));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_GET_BREAKEVEN));
    }

    return await backtest.strategyCoreService.getBreakeven(false, symbol, currentPrice, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    });
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
   * await Live.commitStop("BTCUSDT", "my-strategy");
   * ```
   */
  public commitStop = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ): Promise<void> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_STOP, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_STOP);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_STOP);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_STOP);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_STOP));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_STOP));
    }

    await backtest.strategyCoreService.stop(false, symbol, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    });
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
   * // Cancel scheduled signal in live trading with custom ID
   * await Live.commitCancel("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "",
   *   strategyName: "my-strategy"
   * }, "manual-cancel-001");
   * ```
   */
  public commitCancel = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    },
    cancelId?: string
  ): Promise<void> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_CANCEL, {
      symbol,
      context,
      cancelId,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_CANCEL);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_CANCEL);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_CANCEL);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_CANCEL));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_CANCEL));
    }

    await backtest.strategyCoreService.cancel(false, symbol, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    }, cancelId);
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
   * @param context - Execution context with strategyName and exchangeName
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @throws Error if currentPrice is not in profit direction:
   *   - LONG: currentPrice must be > priceOpen
   *   - SHORT: currentPrice must be < priceOpen
   *
   * @example
   * ```typescript
   * // Close 30% of LONG position at profit
   * const success = await Live.commitPartialProfit("BTCUSDT", 30, 45000, {
   *   exchangeName: "binance",
   *   strategyName: "my-strategy"
   * });
   * if (success) {
   *   console.log('Partial profit executed');
   * }
   * ```
   */
  public commitPartialProfit = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_PARTIAL_PROFIT, {
      symbol,
      percentToClose,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_PARTIAL_PROFIT);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_PARTIAL_PROFIT);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_PARTIAL_PROFIT);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_PARTIAL_PROFIT));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_PARTIAL_PROFIT));
    }

    return await backtest.strategyCoreService.partialProfit(false, symbol, percentToClose, currentPrice, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    });
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
   * @param context - Execution context with strategyName and exchangeName
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @throws Error if currentPrice is not in loss direction:
   *   - LONG: currentPrice must be < priceOpen
   *   - SHORT: currentPrice must be > priceOpen
   *
   * @example
   * ```typescript
   * // Close 40% of LONG position at loss
   * const success = await Live.commitPartialLoss("BTCUSDT", 40, 38000, {
   *   exchangeName: "binance",
   *   strategyName: "my-strategy"
   * });
   * if (success) {
   *   console.log('Partial loss executed');
   * }
   * ```
   */
  public commitPartialLoss = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_PARTIAL_LOSS, {
      symbol,
      percentToClose,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_PARTIAL_LOSS);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_PARTIAL_LOSS);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_PARTIAL_LOSS);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_PARTIAL_LOSS));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_PARTIAL_LOSS));
    }

    return await backtest.strategyCoreService.partialLoss(false, symbol, percentToClose, currentPrice, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    });
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
   * @param context - Execution context with strategyName and exchangeName
   * @returns Promise<boolean> - true if trailing SL was set/updated, false if rejected (absorption/intrusion/conflict)
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalSL=90, distance=10%, currentPrice=102
   *
   * // First call: tighten by 5%
   * const success1 = await Live.commitTrailingStop("BTCUSDT", -5, 102, {
   *   exchangeName: "binance",
   *   strategyName: "my-strategy"
   * });
   * // success1 = true, newDistance = 10% - 5% = 5%, newSL = 95
   *
   * // Second call: try weaker protection (smaller percentShift)
   * const success2 = await Live.commitTrailingStop("BTCUSDT", -3, 102, context);
   * // success2 = false (SKIPPED: newSL=97 < 95, worse protection, larger % absorbs smaller)
   *
   * // Third call: stronger protection (larger percentShift)
   * const success3 = await Live.commitTrailingStop("BTCUSDT", -7, 102, context);
   * // success3 = true (ACCEPTED: newDistance = 10% - 7% = 3%, newSL = 97 > 95, better protection)
   * ```
   */
  public commitTrailingStop = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_TRAILING_STOP, {
      symbol,
      percentShift,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_TRAILING_STOP);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_TRAILING_STOP);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_TRAILING_STOP);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_TRAILING_STOP));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_TRAILING_STOP));
    }

    return await backtest.strategyCoreService.trailingStop(false, symbol, percentShift, currentPrice, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    });
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
   * @param context - Execution context with strategyName and exchangeName
   * @returns Promise<boolean> - true if trailing TP was set/updated, false if rejected (absorption/intrusion/conflict)
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalTP=110, distance=10%, currentPrice=102
   *
   * // First call: bring TP closer by 3%
   * const success1 = await Live.commitTrailingTake("BTCUSDT", -3, 102, {
   *   exchangeName: "binance",
   *   strategyName: "my-strategy"
   * });
   * // success1 = true, newDistance = 10% - 3% = 7%, newTP = 107
   *
   * // Second call: try to move TP further (less conservative)
   * const success2 = await Live.commitTrailingTake("BTCUSDT", 2, 102, context);
   * // success2 = false (SKIPPED: newTP=112 > 107, less conservative, larger % absorbs smaller)
   *
   * // Third call: even more conservative
   * const success3 = await Live.commitTrailingTake("BTCUSDT", -5, 102, context);
   * // success3 = true (ACCEPTED: newDistance = 10% - 5% = 5%, newTP = 105 < 107, more conservative)
   * ```
   */
  public commitTrailingTake = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_TRAILING_PROFIT, {
      symbol,
      percentShift,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_TRAILING_PROFIT);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_TRAILING_PROFIT);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_TRAILING_PROFIT);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_TRAILING_PROFIT));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_TRAILING_PROFIT));
    }

    return await backtest.strategyCoreService.trailingTake(false, symbol, percentShift, currentPrice, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    });
  };

  /**
   * Moves stop-loss to breakeven when price reaches threshold.
   *
   * Moves SL to entry price (zero-risk position) when current price has moved
   * far enough in profit direction. Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price to check threshold
   * @param context - Strategy context with strategyName and exchangeName
   * @returns Promise<boolean> - true if breakeven was set, false otherwise
   *
   * @example
   * ```typescript
   * const moved = await Live.commitBreakeven(
   *   "BTCUSDT",
   *   112,
   *   { strategyName: "my-strategy", exchangeName: "binance" }
   * );
   * console.log(moved); // true (SL moved to entry price)
   * ```
   */
  public commitBreakeven = async (
    symbol: string,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info("Live.breakeven", {
      symbol,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, "Live.breakeven");
    backtest.exchangeValidationService.validate(context.exchangeName, "Live.breakeven");

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, "Live.breakeven");
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, "Live.breakeven"));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, "Live.breakeven"));
    }

    return await backtest.strategyCoreService.breakeven(false, symbol, currentPrice, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: "",
    });
  };

  /**
   * Gets statistical data from all live trading events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @param context - Execution context with exchangeName and frameName
   * @returns Promise resolving to statistical data object
   *
   * @example
   * ```typescript
   * const stats = await Live.getData("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "",
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
    }
  ) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_GET_DATA, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_GET_DATA);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_GET_DATA);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_DATA);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_DATA));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_GET_DATA));
    }

    return await backtest.liveMarkdownService.getData(symbol, context.strategyName, context.exchangeName, "", false);
  };

  /**
   * Generates markdown report with all events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param context - Execution context with exchangeName and frameName
   * @param columns - Optional columns configuration for the report
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Live.getReport("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "",
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
    },
    columns?: Columns[]
  ): Promise<string> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_GET_REPORT, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_GET_REPORT);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_GET_REPORT);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_REPORT);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_GET_REPORT));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_GET_REPORT));
    }

    return await backtest.liveMarkdownService.getReport(symbol, context.strategyName, context.exchangeName, "", false, columns);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param context - Execution context with exchangeName and frameName
   * @param path - Optional directory path to save report (default: "./dump/live")
   * @param columns - Optional columns configuration for the report
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/live/my-strategy.md
   * await Live.dump("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "",
   *   strategyName: "my-strategy"
   * });
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await Live.dump("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "",
   *   strategyName: "my-strategy"
   * }, "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    },
    path?: string,
    columns?: Columns[]
  ): Promise<void> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_DUMP, {
      symbol,
      context,
      path,
    });
    backtest.strategyValidationService.validate(context.strategyName, LIVE_METHOD_NAME_DUMP);
    backtest.exchangeValidationService.validate(context.exchangeName, LIVE_METHOD_NAME_DUMP);

    {
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(context.strategyName);
      riskName && backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_DUMP);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, LIVE_METHOD_NAME_DUMP));
      actions && actions.forEach((actionName) => backtest.actionValidationService.validate(actionName, LIVE_METHOD_NAME_DUMP));
    }

    await backtest.liveMarkdownService.dump(symbol, context.strategyName, context.exchangeName, "", false, path, columns);
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
