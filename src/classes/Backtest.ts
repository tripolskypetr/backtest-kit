import backtest from "../lib";
import { StrategyName } from "../interfaces/Strategy.interface";
import { exitEmitter, doneBacktestSubject } from "../config/emitters";
import { GLOBAL_CONFIG } from "../config/params";
import {
  getErrorMessage,
  memoize,
  randomString,
  singlerun,
} from "functools-kit";
import { Columns } from "../lib/services/markdown/BacktestMarkdownService";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { slPriceToPercentShift } from "../utils/slPriceToPercentShift";
import { tpPriceToPercentShift } from "../utils/tpPriceToPercentShift";
import { Broker } from "./Broker";

const BACKTEST_METHOD_NAME_RUN = "BacktestUtils.run";
const BACKTEST_METHOD_NAME_BACKGROUND = "BacktestUtils.background";
const BACKTEST_METHOD_NAME_STOP = "BacktestUtils.stop";
const BACKTEST_METHOD_NAME_GET_REPORT = "BacktestUtils.getReport";
const BACKTEST_METHOD_NAME_DUMP = "BacktestUtils.dump";
const BACKTEST_METHOD_NAME_TASK = "BacktestUtils.task";
const BACKTEST_METHOD_NAME_GET_STATUS = "BacktestUtils.getStatus";
const BACKTEST_METHOD_NAME_GET_PENDING_SIGNAL =
  "BacktestUtils.getPendingSignal";
const BACKTEST_METHOD_NAME_GET_TOTAL_PERCENT_CLOSED =
  "BacktestUtils.getTotalPercentClosed";
const BACKTEST_METHOD_NAME_GET_TOTAL_COST_CLOSED =
  "BacktestUtils.getTotalCostClosed";
const BACKTEST_METHOD_NAME_GET_SCHEDULED_SIGNAL =
  "BacktestUtils.getScheduledSignal";
const BACKTEST_METHOD_NAME_GET_BREAKEVEN = "BacktestUtils.getBreakeven";
const BACKTEST_METHOD_NAME_GET_POSITION_AVERAGE_PRICE =
  "BacktestUtils.getPositionAveragePrice";
const BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COUNT =
  "BacktestUtils.getPositionInvestedCount";
const BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COST =
  "BacktestUtils.getPositionInvestedCost";
const BACKTEST_METHOD_NAME_GET_POSITION_PNL_PERCENT =
  "BacktestUtils.getPositionPnlPercent";
const BACKTEST_METHOD_NAME_GET_POSITION_PNL_COST =
  "BacktestUtils.getPositionPnlCost";
const BACKTEST_METHOD_NAME_GET_POSITION_LEVELS =
  "BacktestUtils.getPositionLevels";
const BACKTEST_METHOD_NAME_GET_POSITION_PARTIALS =
  "BacktestUtils.getPositionPartials";
const BACKTEST_METHOD_NAME_BREAKEVEN = "Backtest.commitBreakeven";
const BACKTEST_METHOD_NAME_CANCEL_SCHEDULED = "Backtest.commitCancelScheduled";
const BACKTEST_METHOD_NAME_CLOSE_PENDING = "Backtest.commitClosePending";
const BACKTEST_METHOD_NAME_PARTIAL_PROFIT = "BacktestUtils.commitPartialProfit";
const BACKTEST_METHOD_NAME_PARTIAL_LOSS = "BacktestUtils.commitPartialLoss";
const BACKTEST_METHOD_NAME_PARTIAL_PROFIT_COST = "BacktestUtils.commitPartialProfitCost";
const BACKTEST_METHOD_NAME_PARTIAL_LOSS_COST = "BacktestUtils.commitPartialLossCost";
const BACKTEST_METHOD_NAME_TRAILING_STOP = "BacktestUtils.commitTrailingStop";
const BACKTEST_METHOD_NAME_TRAILING_PROFIT = "BacktestUtils.commitTrailingTake";
const BACKTEST_METHOD_NAME_TRAILING_STOP_COST = "BacktestUtils.commitTrailingStopCost";
const BACKTEST_METHOD_NAME_TRAILING_PROFIT_COST = "BacktestUtils.commitTrailingTakeCost";
const BACKTEST_METHOD_NAME_ACTIVATE_SCHEDULED = "Backtest.commitActivateScheduled";
const BACKTEST_METHOD_NAME_AVERAGE_BUY = "Backtest.commitAverageBuy";
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
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionCoreService.clear({
            actionName,
            strategyName: context.strategyName,
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
      backtest.strategyCoreService.stopStrategy(true, symbol, {
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
      });
      backtest.strategyCoreService
        .hasPendingSignal(true, symbol, {
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
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
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
      const { riskName, riskList, actions } = backtest.strategySchemaService.get(
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
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
    currentPrice: number,
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_PENDING_SIGNAL
          )
        );
    }

    return await backtest.strategyCoreService.getPendingSignal(
      true,
      symbol,
      currentPrice,
      context
    );
  };

  /**
   * Returns the percentage of the position currently held (not closed).
   * 100 = nothing has been closed (full position), 0 = fully closed.
   * Correctly accounts for DCA entries between partial closes.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context with strategyName, exchangeName, frameName
   * @returns Promise<number> - held percentage (0–100)
   *
   * @example
   * ```typescript
   * const heldPct = await Backtest.getTotalPercentClosed("BTCUSDT", { strategyName, exchangeName, frameName });
   * console.log(`Holding ${heldPct}% of position`);
   * ```
   */
  public getTotalPercentClosed = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_TOTAL_PERCENT_CLOSED, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_TOTAL_PERCENT_CLOSED
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_TOTAL_PERCENT_CLOSED
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_TOTAL_PERCENT_CLOSED
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_TOTAL_PERCENT_CLOSED
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_TOTAL_PERCENT_CLOSED
          )
        );
    }

    return await backtest.strategyCoreService.getTotalPercentClosed(
      true,
      symbol,
      context
    );
  };

  /**
   * Returns the cost basis in dollars of the position currently held (not closed).
   * Correctly accounts for DCA entries between partial closes.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context with strategyName, exchangeName, frameName
   * @returns Promise<number> - held cost basis in dollars
   *
   * @example
   * ```typescript
   * const heldCost = await Backtest.getTotalCostClosed("BTCUSDT", { strategyName, exchangeName, frameName });
   * console.log(`Holding $${heldCost} of position`);
   * ```
   */
  public getTotalCostClosed = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_TOTAL_COST_CLOSED, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_TOTAL_COST_CLOSED
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_TOTAL_COST_CLOSED
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_TOTAL_COST_CLOSED
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_TOTAL_COST_CLOSED
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_TOTAL_COST_CLOSED
          )
        );
    }

    return await backtest.strategyCoreService.getTotalCostClosed(
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
    currentPrice: number,
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_SCHEDULED_SIGNAL
          )
        );
    }

    return await backtest.strategyCoreService.getScheduledSignal(
      true,
      symbol,
      currentPrice,
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
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
   * Returns the effective (weighted average) entry price for the current pending signal.
   *
   * Accounts for all DCA entries via commitAverageBuy.
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Effective entry price, or null if no active position
   */
  public getPositionAveragePrice = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<number | null> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_POSITION_AVERAGE_PRICE, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_POSITION_AVERAGE_PRICE
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_POSITION_AVERAGE_PRICE
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_POSITION_AVERAGE_PRICE
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_POSITION_AVERAGE_PRICE
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_POSITION_AVERAGE_PRICE
          )
        );
    }

    return await backtest.strategyCoreService.getPositionAveragePrice(
      true,
      symbol,
      context
    );
  };

  /**
   * Returns the total number of base-asset units currently held in the position.
   *
   * Includes units from all DCA entries. Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Total units held, or null if no active position
   */
  public getPositionInvestedCount = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<number | null> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COUNT, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COUNT
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COUNT
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COUNT
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COUNT
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COUNT
          )
        );
    }

    return await backtest.strategyCoreService.getPositionInvestedCount(
      true,
      symbol,
      context
    );
  };

  /**
   * Returns the total dollar cost invested in the current position.
   *
   * Sum of all entry costs across DCA entries. Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Total invested cost in quote currency, or null if no active position
   */
  public getPositionInvestedCost = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<number | null> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COST, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COST
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COST
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COST
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COST
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_POSITION_INVESTED_COST
          )
        );
    }

    return await backtest.strategyCoreService.getPositionInvestedCost(
      true,
      symbol,
      context
    );
  };

  /**
   * Returns the current unrealized PnL as a percentage of the invested cost.
   *
   * Calculated relative to the effective (weighted average) entry price.
   * Positive for profit, negative for loss. Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns PnL percentage, or null if no active position
   */
  public getPositionPnlPercent = async (
    symbol: string,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<number | null> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_POSITION_PNL_PERCENT, {
      symbol,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_POSITION_PNL_PERCENT
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_POSITION_PNL_PERCENT
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_POSITION_PNL_PERCENT
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_POSITION_PNL_PERCENT
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_POSITION_PNL_PERCENT
          )
        );
    }

    return await backtest.strategyCoreService.getPositionPnlPercent(
      true,
      symbol,
      currentPrice,
      context
    );
  };

  /**
   * Returns the current unrealized PnL in quote currency (dollar amount).
   *
   * Calculated as (currentPrice - effectiveEntry) * units for LONG,
   * reversed for SHORT. Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns PnL in quote currency, or null if no active position
   */
  public getPositionPnlCost = async (
    symbol: string,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<number | null> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_POSITION_PNL_COST, {
      symbol,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_POSITION_PNL_COST
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_POSITION_PNL_COST
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_POSITION_PNL_COST
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_POSITION_PNL_COST
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_POSITION_PNL_COST
          )
        );
    }

    return await backtest.strategyCoreService.getPositionPnlCost(
      true,
      symbol,
      currentPrice,
      context
    );
  };

  /**
   * Returns the list of DCA entry prices for the current pending signal.
   *
   * The first element is always the original priceOpen (initial entry).
   * Each subsequent element is a price added by commitAverageBuy().
   * Returns null if no pending signal exists.
   * Returns a single-element array [priceOpen] if no DCA entries were made.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Array of entry prices, or null if no active position
   */
  public getPositionLevels = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<number[] | null> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_POSITION_LEVELS, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_POSITION_LEVELS
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_POSITION_LEVELS
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_POSITION_LEVELS
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_POSITION_LEVELS
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_POSITION_LEVELS
          )
        );
    }

    return await backtest.strategyCoreService.getPositionLevels(
      true,
      symbol,
      context
    );
  };

  /**
   * Returns the list of partial close events for the current pending signal.
   *
   * Each element represents a partial profit or loss close executed via
   * commitPartialProfit / commitPartialLoss (or their Cost variants).
   * Returns null if no pending signal exists.
   * Returns an empty array if no partials were executed yet.
   *
   * Each entry contains:
   * - `type` — "profit" or "loss"
   * - `percent` — percentage of position closed at this partial
   * - `currentPrice` — execution price of the partial close
   * - `costBasisAtClose` — accounting cost basis at the moment of this partial
   * - `entryCountAtClose` — number of DCA entries accumulated at this partial
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Array of partial close records, or null if no active position
   */
  public getPositionPartials = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_GET_POSITION_PARTIALS, {
      symbol,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_GET_POSITION_PARTIALS
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_GET_POSITION_PARTIALS
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_GET_POSITION_PARTIALS
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_GET_POSITION_PARTIALS
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_GET_POSITION_PARTIALS
          )
        );
    }

    return await backtest.strategyCoreService.getPositionPartials(
      true,
      symbol,
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_STOP
          )
        );
    }

    await backtest.strategyCoreService.stopStrategy(true, symbol, context);
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
   * await Backtest.commitCancel("BTCUSDT", "my-strategy", {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * }, "manual-cancel-001");
   * ```
   */
  public commitCancelScheduled = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    cancelId?: string
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_CANCEL_SCHEDULED, {
      symbol,
      context,
      cancelId,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_CANCEL_SCHEDULED
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_CANCEL_SCHEDULED
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_CANCEL_SCHEDULED
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_CANCEL_SCHEDULED
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_CANCEL_SCHEDULED
          )
        );
    }

    await backtest.strategyCoreService.cancelScheduled(
      true,
      symbol,
      context,
      cancelId
    );
  };

  /**
   * Closes the pending signal without stopping the strategy.
   *
   * Clears the pending signal (active position).
   * Does NOT affect scheduled signals or strategy operation.
   * Does NOT set stop flag - strategy can continue generating new signals.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @param closeId - Optional close ID for user-initiated closes
   * @returns Promise that resolves when pending signal is closed
   *
   * @example
   * ```typescript
   * // Close pending signal with custom ID
   * await Backtest.commitClose("BTCUSDT", {
   *   exchangeName: "binance",
   *   strategyName: "my-strategy",
   *   frameName: "1m"
   * }, "manual-close-001");
   * ```
   */
  public commitClosePending = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    closeId?: string
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_CLOSE_PENDING, {
      symbol,
      context,
      closeId,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_CLOSE_PENDING
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_CLOSE_PENDING
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_CLOSE_PENDING
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_CLOSE_PENDING
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_CLOSE_PENDING
          )
        );
    }

    await Broker.commitClosePending({ symbol, closeId, context });
    await backtest.strategyCoreService.closePending(
      true,
      symbol,
      context,
      closeId
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
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @throws Error if currentPrice is not in profit direction:
   *   - LONG: currentPrice must be > priceOpen
   *   - SHORT: currentPrice must be < priceOpen
   *
   * @example
   * ```typescript
   * // Close 30% of LONG position at profit
   * const success = await Backtest.commitPartialProfit("BTCUSDT", 30, 45000, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
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
      frameName: FrameName;
    }
  ): Promise<boolean> => {
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_PARTIAL_PROFIT
          )
        );
    }

    await Broker.commitPartialProfit({ symbol, percentToClose, currentPrice, context });
    return await backtest.strategyCoreService.partialProfit(
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
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @throws Error if currentPrice is not in loss direction:
   *   - LONG: currentPrice must be < priceOpen
   *   - SHORT: currentPrice must be > priceOpen
   *
   * @example
   * ```typescript
   * // Close 40% of LONG position at loss
   * const success = await Backtest.commitPartialLoss("BTCUSDT", 40, 38000, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
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
      frameName: FrameName;
    }
  ): Promise<boolean> => {
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_PARTIAL_LOSS
          )
        );
    }

    await Broker.commitPartialLoss({ symbol, percentToClose, currentPrice, context });
    return await backtest.strategyCoreService.partialLoss(
      true,
      symbol,
      percentToClose,
      currentPrice,
      context
    );
  };

  /**
   * Executes partial close at profit level by absolute dollar amount (moving toward TP).
   *
   * Convenience wrapper around commitPartialProfit that converts a dollar amount
   * to a percentage of the invested position cost automatically.
   * Price must be moving toward take profit (in profit direction).
   *
   * @param symbol - Trading pair symbol
   * @param dollarAmount - Dollar value of position to close (e.g. 150 closes $150 worth)
   * @param currentPrice - Current market price for this partial close
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Promise<boolean> - true if partial close executed, false if skipped or no position
   *
   * @throws Error if currentPrice is not in profit direction:
   *   - LONG: currentPrice must be > priceOpen
   *   - SHORT: currentPrice must be < priceOpen
   *
   * @example
   * ```typescript
   * // Close $150 of a $300 position (50%) at profit
   * const success = await Backtest.commitPartialProfitCost("BTCUSDT", 150, 45000, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * if (success) {
   *   console.log('Partial profit executed');
   * }
   * ```
   */
  public commitPartialProfitCost = async (
    symbol: string,
    dollarAmount: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_PARTIAL_PROFIT_COST, {
      symbol,
      dollarAmount,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_PARTIAL_PROFIT_COST
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_PARTIAL_PROFIT_COST
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(riskName, BACKTEST_METHOD_NAME_PARTIAL_PROFIT_COST);
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(riskName, BACKTEST_METHOD_NAME_PARTIAL_PROFIT_COST)
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(actionName, BACKTEST_METHOD_NAME_PARTIAL_PROFIT_COST)
        );
    }

    const investedCost = await backtest.strategyCoreService.getPositionInvestedCost(
      true,
      symbol,
      context
    );
    if (investedCost === null) return false;
    const percentToClose = (dollarAmount / investedCost) * 100;
    await Broker.commitPartialProfit({ symbol, percentToClose, currentPrice, context });
    return await backtest.strategyCoreService.partialProfit(
      true,
      symbol,
      percentToClose,
      currentPrice,
      context
    );
  };

  /**
   * Executes partial close at loss level by absolute dollar amount (moving toward SL).
   *
   * Convenience wrapper around commitPartialLoss that converts a dollar amount
   * to a percentage of the invested position cost automatically.
   * Price must be moving toward stop loss (in loss direction).
   *
   * @param symbol - Trading pair symbol
   * @param dollarAmount - Dollar value of position to close (e.g. 100 closes $100 worth)
   * @param currentPrice - Current market price for this partial close
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Promise<boolean> - true if partial close executed, false if skipped or no position
   *
   * @throws Error if currentPrice is not in loss direction:
   *   - LONG: currentPrice must be < priceOpen
   *   - SHORT: currentPrice must be > priceOpen
   *
   * @example
   * ```typescript
   * // Close $100 of a $300 position (~33%) at loss
   * const success = await Backtest.commitPartialLossCost("BTCUSDT", 100, 38000, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * if (success) {
   *   console.log('Partial loss executed');
   * }
   * ```
   */
  public commitPartialLossCost = async (
    symbol: string,
    dollarAmount: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_PARTIAL_LOSS_COST, {
      symbol,
      dollarAmount,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_PARTIAL_LOSS_COST
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_PARTIAL_LOSS_COST
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(riskName, BACKTEST_METHOD_NAME_PARTIAL_LOSS_COST);
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(riskName, BACKTEST_METHOD_NAME_PARTIAL_LOSS_COST)
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(actionName, BACKTEST_METHOD_NAME_PARTIAL_LOSS_COST)
        );
    }

    const investedCost = await backtest.strategyCoreService.getPositionInvestedCost(
      true,
      symbol,
      context
    );
    if (investedCost === null) return false;
    const percentToClose = (dollarAmount / investedCost) * 100;
    await Broker.commitPartialLoss({ symbol, percentToClose, currentPrice, context });
    return await backtest.strategyCoreService.partialLoss(
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
   * await Backtest.commitTrailingStop("BTCUSDT", -5, 102, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * // newDistance = 10% - 5% = 5%, newSL = 95
   *
   * // Second call: try weaker protection (smaller percentShift)
   * await Backtest.commitTrailingStop("BTCUSDT", -3, 102, context);
   * // SKIPPED: newSL=97 < 95 (worse protection, larger % absorbs smaller)
   *
   * // Third call: stronger protection (larger percentShift)
   * await Backtest.commitTrailingStop("BTCUSDT", -7, 102, context);
   * // ACCEPTED: newDistance = 10% - 7% = 3%, newSL = 97 > 95 (better protection)
   * ```
   */
  public commitTrailingStop = async (
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_TRAILING_STOP
          )
        );
    }

    await Broker.commitTrailingStop({ symbol, percentShift, currentPrice, context });
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
   * await Backtest.commitTrailingTake("BTCUSDT", -3, 102, {
   *   exchangeName: "binance",
   *   frameName: "frame1",
   *   strategyName: "my-strategy"
   * });
   * // newDistance = 10% - 3% = 7%, newTP = 107
   *
   * // Second call: try to move TP further (less conservative)
   * await Backtest.commitTrailingTake("BTCUSDT", 2, 102, context);
   * // SKIPPED: newTP=112 > 107 (less conservative, larger % absorbs smaller)
   *
   * // Third call: even more conservative
   * await Backtest.commitTrailingTake("BTCUSDT", -5, 102, context);
   * // ACCEPTED: newDistance = 10% - 5% = 5%, newTP = 105 < 107 (more conservative)
   * ```
   */
  public commitTrailingTake = async (
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_TRAILING_PROFIT
          )
        );
    }

    await Broker.commitTrailingTake({ symbol, percentShift, currentPrice, context });
    return await backtest.strategyCoreService.trailingTake(
      true,
      symbol,
      percentShift,
      currentPrice,
      context
    );
  };

  /**
   * Adjusts the trailing stop-loss to an absolute price level.
   *
   * Convenience wrapper around commitTrailingStop that converts an absolute
   * stop-loss price to a percentShift relative to the ORIGINAL SL distance.
   *
   * @param symbol - Trading pair symbol
   * @param newStopLossPrice - Desired absolute stop-loss price
   * @param currentPrice - Current market price to check for intrusion
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Promise<boolean> - true if trailing SL was set/updated, false if rejected
   */
  public commitTrailingStopCost = async (
    symbol: string,
    newStopLossPrice: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_TRAILING_STOP_COST, {
      symbol,
      newStopLossPrice,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_TRAILING_STOP_COST
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_TRAILING_STOP_COST
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(riskName, BACKTEST_METHOD_NAME_TRAILING_STOP_COST);
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(riskName, BACKTEST_METHOD_NAME_TRAILING_STOP_COST)
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(actionName, BACKTEST_METHOD_NAME_TRAILING_STOP_COST)
        );
    }

    const signal = await backtest.strategyCoreService.getPendingSignal(true, symbol, currentPrice, context);
    if (!signal) return false;
    const effectivePriceOpen = await backtest.strategyCoreService.getPositionAveragePrice(true, symbol, context);
    if (effectivePriceOpen === null) return false;
    const percentShift = slPriceToPercentShift(newStopLossPrice, signal.priceStopLoss, effectivePriceOpen);
    await Broker.commitTrailingStop({ symbol, percentShift, currentPrice, context });
    return await backtest.strategyCoreService.trailingStop(true, symbol, percentShift, currentPrice, context);
  };

  /**
   * Adjusts the trailing take-profit to an absolute price level.
   *
   * Convenience wrapper around commitTrailingTake that converts an absolute
   * take-profit price to a percentShift relative to the ORIGINAL TP distance.
   *
   * @param symbol - Trading pair symbol
   * @param newTakeProfitPrice - Desired absolute take-profit price
   * @param currentPrice - Current market price to check for intrusion
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns Promise<boolean> - true if trailing TP was set/updated, false if rejected
   */
  public commitTrailingTakeCost = async (
    symbol: string,
    newTakeProfitPrice: number,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_TRAILING_PROFIT_COST, {
      symbol,
      newTakeProfitPrice,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_TRAILING_PROFIT_COST
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_TRAILING_PROFIT_COST
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(riskName, BACKTEST_METHOD_NAME_TRAILING_PROFIT_COST);
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(riskName, BACKTEST_METHOD_NAME_TRAILING_PROFIT_COST)
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(actionName, BACKTEST_METHOD_NAME_TRAILING_PROFIT_COST)
        );
    }

    const signal = await backtest.strategyCoreService.getPendingSignal(true, symbol, currentPrice, context);
    if (!signal) return false;
    const effectivePriceOpen = await backtest.strategyCoreService.getPositionAveragePrice(true, symbol, context);
    if (effectivePriceOpen === null) return false;
    const percentShift = tpPriceToPercentShift(newTakeProfitPrice, signal.priceTakeProfit, effectivePriceOpen);
    await Broker.commitTrailingTake({ symbol, percentShift, currentPrice, context });
    return await backtest.strategyCoreService.trailingTake(true, symbol, percentShift, currentPrice, context);
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
   * const moved = await Backtest.commitBreakeven(
   *   "BTCUSDT",
   *   112,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" }
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
      frameName: FrameName;
    }
  ): Promise<boolean> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_BREAKEVEN, {
      symbol,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_BREAKEVEN
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_BREAKEVEN
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_BREAKEVEN
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_BREAKEVEN
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_BREAKEVEN
          )
        );
    }

    await Broker.commitBreakeven({ symbol, currentPrice, context });
    return await backtest.strategyCoreService.breakeven(
      true,
      symbol,
      currentPrice,
      context
    );
  };

  /**
   * Activates a scheduled signal early without waiting for price to reach priceOpen.
   *
   * Sets the activation flag on the scheduled signal. The actual activation
   * happens on the next tick() when strategy detects the flag.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @param activateId - Optional activation ID for tracking user-initiated activations
   * @returns Promise that resolves when activation flag is set
   *
   * @example
   * ```typescript
   * // Activate scheduled signal early with custom ID
   * await Backtest.commitActivateScheduled("BTCUSDT", {
   *   strategyName: "my-strategy",
   *   exchangeName: "binance",
   *   frameName: "1h"
   * }, "manual-activate-001");
   * ```
   */
  public commitActivateScheduled = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    activateId?: string
  ): Promise<void> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_ACTIVATE_SCHEDULED, {
      symbol,
      context,
      activateId,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_ACTIVATE_SCHEDULED
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_ACTIVATE_SCHEDULED
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_ACTIVATE_SCHEDULED
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_ACTIVATE_SCHEDULED
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_ACTIVATE_SCHEDULED
          )
        );
    }

    await backtest.strategyCoreService.activateScheduled(
      true,
      symbol,
      context,
      activateId
    );
  };

  /**
   * Adds a new DCA entry to the active pending signal.
   *
   * Adds a new averaging entry at currentPrice to the position's entry history.
   * Updates effectivePriceOpen (mean of all entries) and emits average-buy commit event.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - New entry price to add to the averaging history
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if entry added, false if rejected
   *
   * @example
   * ```typescript
   * // Add DCA entry at current price
   * const success = await Backtest.commitAverageBuy("BTCUSDT", 42000, {
   *   strategyName: "my-strategy",
   *   exchangeName: "binance",
   *   frameName: "1h"
   * });
   * if (success) {
   *   console.log('DCA entry added');
   * }
   * ```
   */
  public commitAverageBuy = async (
    symbol: string,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    cost: number = GLOBAL_CONFIG.CC_POSITION_ENTRY_COST
  ): Promise<boolean> => {
    backtest.loggerService.info(BACKTEST_METHOD_NAME_AVERAGE_BUY, {
      symbol,
      currentPrice,
      context,
    });
    backtest.strategyValidationService.validate(
      context.strategyName,
      BACKTEST_METHOD_NAME_AVERAGE_BUY
    );
    backtest.exchangeValidationService.validate(
      context.exchangeName,
      BACKTEST_METHOD_NAME_AVERAGE_BUY
    );

    {
      const { riskName, riskList, actions } =
        backtest.strategySchemaService.get(context.strategyName);
      riskName &&
        backtest.riskValidationService.validate(
          riskName,
          BACKTEST_METHOD_NAME_AVERAGE_BUY
        );
      riskList &&
        riskList.forEach((riskName) =>
          backtest.riskValidationService.validate(
            riskName,
            BACKTEST_METHOD_NAME_AVERAGE_BUY
          )
        );
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
            BACKTEST_METHOD_NAME_AVERAGE_BUY
          )
        );
    }

    await Broker.commitAverageBuy({ symbol, currentPrice, cost, context });
    return await backtest.strategyCoreService.averageBuy(
      true,
      symbol,
      currentPrice,
      context,
      cost
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
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
      const { riskName, riskList, actions } =
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
      actions &&
        actions.forEach((actionName) =>
          backtest.actionValidationService.validate(
            actionName,
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
