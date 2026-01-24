import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import StrategyCoreService from "../core/StrategyCoreService";
import { Report } from "../../../classes/Report";
import { singleshot } from "functools-kit";
import ExecutionContextService, {
  TExecutionContextService,
} from "../context/ExecutionContextService";
import { FrameName } from "../../../interfaces/Frame.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { strategyCommitSubject } from "../../../config/emitters";
import { StrategyCommitContract } from "../../../contract/StrategyCommit.contract";

/**
 * Extracts execution context timestamp for strategy event logging.
 *
 * @param self - The StrategyReportService instance to extract context from
 * @returns Object containing ISO 8601 formatted timestamp, or empty string if no context
 * @internal
 */
const GET_EXECUTION_CONTEXT_FN = (self: StrategyReportService) => {
  if (ExecutionContextService.hasContext()) {
    const { when } = self.executionContextService.context;
    return { when: when.toISOString() };
  }
  return {
    when: "",
  };
};

/**
 * Service for persisting strategy management events to JSON report files.
 *
 * Handles logging of strategy actions (cancel-scheduled, close-pending, partial-profit,
 * partial-loss, trailing-stop, trailing-take, breakeven) to persistent storage via
 * the Report class. Each event is written as a separate JSON record.
 *
 * Unlike StrategyMarkdownService which accumulates events in memory for markdown reports,
 * this service writes each event immediately to disk for audit trail purposes.
 *
 * Lifecycle:
 * - Call subscribe() to enable event logging
 * - Events are written via Report.writeData() with "strategy" category
 * - Call unsubscribe() to disable event logging
 *
 * @example
 * ```typescript
 * // Service is typically used internally by strategy management classes
 * strategyReportService.subscribe();
 *
 * // Events are logged automatically when strategy actions occur
 * await strategyReportService.partialProfit("BTCUSDT", 50, 50100, false, {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1h"
 * });
 *
 * strategyReportService.unsubscribe();
 * ```
 *
 * @see StrategyMarkdownService for in-memory event accumulation and markdown report generation
 * @see Report for the underlying persistence mechanism
 */
export class StrategyReportService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService,
  );
  readonly strategyCoreService = inject<StrategyCoreService>(
    TYPES.strategyCoreService,
  );

  /**
   * Logs a cancel-scheduled event when a scheduled signal is cancelled.
   *
   * Retrieves the scheduled signal from StrategyCoreService and writes
   * the cancellation event to the report file.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param cancelId - Optional identifier for the cancellation reason
   */
  public cancelScheduled = async (
    symbol: string,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    cancelId?: string,
  ) => {
    this.loggerService.log("strategyReportService cancelScheduled", {
      symbol,
      isBacktest,
      cancelId,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const scheduledRow = await this.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!scheduledRow) {
      return;
    }
    await Report.writeData(
      "strategy",
      {
        action: "cancel-scheduled",
        cancelId,
        symbol,
        createdAt,
      },
      {
        signalId: scheduledRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  /**
   * Logs a close-pending event when a pending signal is closed.
   *
   * Retrieves the pending signal from StrategyCoreService and writes
   * the close event to the report file.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param closeId - Optional identifier for the close reason
   */
  public closePending = async (
    symbol: string,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    closeId?: string,
  ) => {
    this.loggerService.log("strategyReportService closePending", {
      symbol,
      isBacktest,
      closeId,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    await Report.writeData(
      "strategy",
      {
        action: "close-pending",
        closeId,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  /**
   * Logs a partial-profit event when a portion of the position is closed at profit.
   *
   * Records the percentage closed and current price when partial profit-taking occurs.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Percentage of position to close (0-100)
   * @param currentPrice - Current market price at time of partial close
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public partialProfit = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyReportService partialProfit", {
      symbol,
      percentToClose,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    await Report.writeData(
      "strategy",
      {
        action: "partial-profit",
        percentToClose,
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  /**
   * Logs a partial-loss event when a portion of the position is closed at loss.
   *
   * Records the percentage closed and current price when partial loss-cutting occurs.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Percentage of position to close (0-100)
   * @param currentPrice - Current market price at time of partial close
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public partialLoss = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyReportService partialLoss", {
      symbol,
      percentToClose,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    await Report.writeData(
      "strategy",
      {
        action: "partial-loss",
        percentToClose,
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  /**
   * Logs a trailing-stop event when the stop-loss is adjusted.
   *
   * Records the percentage shift and current price when trailing stop moves.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentShift - Percentage the stop-loss was shifted
   * @param currentPrice - Current market price at time of adjustment
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public trailingStop = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyReportService trailingStop", {
      symbol,
      percentShift,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    await Report.writeData(
      "strategy",
      {
        action: "trailing-stop",
        percentShift,
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  /**
   * Logs a trailing-take event when the take-profit is adjusted.
   *
   * Records the percentage shift and current price when trailing take-profit moves.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentShift - Percentage the take-profit was shifted
   * @param currentPrice - Current market price at time of adjustment
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public trailingTake = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyReportService trailingTake", {
      symbol,
      percentShift,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    await Report.writeData(
      "strategy",
      {
        action: "trailing-take",
        percentShift,
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  /**
   * Logs a breakeven event when the stop-loss is moved to entry price.
   *
   * Records the current price when breakeven protection is activated.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - Current market price at time of breakeven activation
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public breakeven = async (
    symbol: string,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("strategyReportService breakeven", {
      symbol,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    await Report.writeData(
      "strategy",
      {
        action: "breakeven",
        currentPrice,
        symbol,
        createdAt,
      },
      {
        signalId: pendingRow.id,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  /**
   * Handles incoming signal management events from strategyCommitSubject.
   * Routes events to appropriate handler methods based on action type.
   *
   * @param event - The signal management event
   */
  private handleSignalEvent = async (event: StrategyCommitContract) => {
    this.loggerService.log("strategyReportService handleSignalEvent", {
      action: event.action,
      symbol: event.symbol,
      backtest: event.backtest,
    });
    const context = {
      strategyName: event.strategyName,
      exchangeName: event.exchangeName,
      frameName: event.frameName,
    };
    switch (event.action) {
      case "cancel-scheduled":
        await this.cancelScheduled(event.symbol, event.backtest, context, event.cancelId);
        break;
      case "close-pending":
        await this.closePending(event.symbol, event.backtest, context, event.closeId);
        break;
      case "partial-profit":
        await this.partialProfit(event.symbol, event.percentToClose, event.currentPrice, event.backtest, context);
        break;
      case "partial-loss":
        await this.partialLoss(event.symbol, event.percentToClose, event.currentPrice, event.backtest, context);
        break;
      case "trailing-stop":
        await this.trailingStop(event.symbol, event.percentShift, event.currentPrice, event.backtest, context);
        break;
      case "trailing-take":
        await this.trailingTake(event.symbol, event.percentShift, event.currentPrice, event.backtest, context);
        break;
      case "breakeven":
        await this.breakeven(event.symbol, event.currentPrice, event.backtest, context);
        break;
    }
  };

  /**
   * Initializes the service for event logging.
   *
   * Must be called before any events can be logged. Uses singleshot pattern
   * to ensure only one subscription exists at a time.
   *
   * @returns Cleanup function that clears the subscription when called
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("strategyReportService subscribe");
    const unsubscribe = strategyCommitSubject.subscribe(this.handleSignalEvent);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  /**
   * Stops event logging and cleans up the subscription.
   *
   * Safe to call multiple times - only clears if subscription exists.
   */
  public unsubscribe = async () => {
    this.loggerService.log("strategyReportService unsubscribe");
    if (this.subscribe.hasValue()) {
      this.subscribe.clear();
    }
  };
}

export default StrategyReportService;
