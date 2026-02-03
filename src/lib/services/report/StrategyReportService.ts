import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import StrategyCoreService from "../core/StrategyCoreService";
import { Report } from "../../../classes/Report";
import { compose, singleshot } from "functools-kit";
import { FrameName } from "../../../interfaces/Frame.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { strategyCommitSubject } from "../../../config/emitters";
import {
  ActivateScheduledCommit,
  BreakevenCommit,
  CancelScheduledCommit,
  ClosePendingCommit,
  PartialLossCommit,
  PartialProfitCommit,
  TrailingStopCommit,
  TrailingTakeCommit,
} from "../../../contract/StrategyCommit.contract";

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
 * @see StrategyMarkdownService for in-memory event accumulation and markdown report generation
 * @see Report for the underlying persistence mechanism
 */
export class StrategyReportService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly strategyCoreService = inject<StrategyCoreService>(
    TYPES.strategyCoreService,
  );

  /**
   * Logs a cancel-scheduled event when a scheduled signal is cancelled.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param timestamp - Timestamp from StrategyCommitContract (execution context time)
   * @param cancelId - Optional identifier for the cancellation reason
   */
  public cancelScheduled = async (
    symbol: string,
    isBacktest: boolean,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    timestamp: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await Report.writeData(
      "strategy",
      {
        action: "cancel-scheduled",
        cancelId,
        symbol,
        timestamp,
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
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param timestamp - Timestamp from StrategyCommitContract (execution context time)
   * @param closeId - Optional identifier for the close reason
   */
  public closePending = async (
    symbol: string,
    isBacktest: boolean,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    timestamp: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await Report.writeData(
      "strategy",
      {
        action: "close-pending",
        closeId,
        symbol,
        timestamp,
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
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Percentage of position to close (0-100)
   * @param currentPrice - Current market price at time of partial close
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param timestamp - Timestamp from StrategyCommitContract (execution context time)
   * @param position - Trade direction: "long" or "short"
   * @param priceOpen - Entry price for the position
   * @param priceTakeProfit - Effective take profit price
   * @param priceStopLoss - Effective stop loss price
   * @param originalPriceTakeProfit - Original take profit before trailing
   * @param originalPriceStopLoss - Original stop loss before trailing
   * @param scheduledAt - Signal creation timestamp in milliseconds
   * @param pendingAt - Pending timestamp in milliseconds
   */
  public partialProfit = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    timestamp: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await Report.writeData(
      "strategy",
      {
        action: "partial-profit",
        percentToClose,
        currentPrice,
        symbol,
        timestamp,
        createdAt,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        originalPriceTakeProfit,
        originalPriceStopLoss,
        scheduledAt,
        pendingAt,
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
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Percentage of position to close (0-100)
   * @param currentPrice - Current market price at time of partial close
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param timestamp - Timestamp from StrategyCommitContract (execution context time)
   * @param position - Trade direction: "long" or "short"
   * @param priceOpen - Entry price for the position
   * @param priceTakeProfit - Effective take profit price
   * @param priceStopLoss - Effective stop loss price
   * @param originalPriceTakeProfit - Original take profit before trailing
   * @param originalPriceStopLoss - Original stop loss before trailing
   * @param scheduledAt - Signal creation timestamp in milliseconds
   * @param pendingAt - Pending timestamp in milliseconds
   */
  public partialLoss = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    timestamp: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await Report.writeData(
      "strategy",
      {
        action: "partial-loss",
        percentToClose,
        currentPrice,
        symbol,
        timestamp,
        createdAt,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        originalPriceTakeProfit,
        originalPriceStopLoss,
        scheduledAt,
        pendingAt,
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
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentShift - Percentage the stop-loss was shifted
   * @param currentPrice - Current market price at time of adjustment
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param timestamp - Timestamp from StrategyCommitContract (execution context time)
   * @param position - Trade direction: "long" or "short"
   * @param priceOpen - Entry price for the position
   * @param priceTakeProfit - Effective take profit price
   * @param priceStopLoss - Effective stop loss price
   * @param originalPriceTakeProfit - Original take profit before trailing
   * @param originalPriceStopLoss - Original stop loss before trailing
   * @param scheduledAt - Signal creation timestamp in milliseconds
   * @param pendingAt - Pending timestamp in milliseconds
   */
  public trailingStop = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    timestamp: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await Report.writeData(
      "strategy",
      {
        action: "trailing-stop",
        percentShift,
        currentPrice,
        symbol,
        timestamp,
        createdAt,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        originalPriceTakeProfit,
        originalPriceStopLoss,
        scheduledAt,
        pendingAt,
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
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentShift - Percentage the take-profit was shifted
   * @param currentPrice - Current market price at time of adjustment
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param timestamp - Timestamp from StrategyCommitContract (execution context time)
   * @param position - Trade direction: "long" or "short"
   * @param priceOpen - Entry price for the position
   * @param priceTakeProfit - Effective take profit price
   * @param priceStopLoss - Effective stop loss price
   * @param originalPriceTakeProfit - Original take profit before trailing
   * @param originalPriceStopLoss - Original stop loss before trailing
   * @param scheduledAt - Signal creation timestamp in milliseconds
   * @param pendingAt - Pending timestamp in milliseconds
   */
  public trailingTake = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    timestamp: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await Report.writeData(
      "strategy",
      {
        action: "trailing-take",
        percentShift,
        currentPrice,
        symbol,
        timestamp,
        createdAt,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        originalPriceTakeProfit,
        originalPriceStopLoss,
        scheduledAt,
        pendingAt,
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
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - Current market price at time of breakeven activation
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param timestamp - Timestamp from StrategyCommitContract (execution context time)
   * @param position - Trade direction: "long" or "short"
   * @param priceOpen - Entry price for the position
   * @param priceTakeProfit - Effective take profit price
   * @param priceStopLoss - Effective stop loss price
   * @param originalPriceTakeProfit - Original take profit before trailing
   * @param originalPriceStopLoss - Original stop loss before trailing
   * @param scheduledAt - Signal creation timestamp in milliseconds
   * @param pendingAt - Pending timestamp in milliseconds
   */
  public breakeven = async (
    symbol: string,
    currentPrice: number,
    isBacktest: boolean,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    timestamp: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
  ) => {
    this.loggerService.log("strategyReportService breakeven", {
      symbol,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
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
    const createdAt = new Date(timestamp).toISOString();
    await Report.writeData(
      "strategy",
      {
        action: "breakeven",
        currentPrice,
        symbol,
        timestamp,
        createdAt,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        originalPriceTakeProfit,
        originalPriceStopLoss,
        scheduledAt,
        pendingAt,
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
   * Logs an activate-scheduled event when a scheduled signal is activated early.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - Current market price at time of activation
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param timestamp - Timestamp from StrategyCommitContract (execution context time)
   * @param position - Trade direction: "long" or "short"
   * @param priceOpen - Entry price for the position
   * @param priceTakeProfit - Effective take profit price
   * @param priceStopLoss - Effective stop loss price
   * @param originalPriceTakeProfit - Original take profit before trailing
   * @param originalPriceStopLoss - Original stop loss before trailing
   * @param scheduledAt - Signal creation timestamp in milliseconds
   * @param pendingAt - Pending timestamp in milliseconds
   * @param activateId - Optional identifier for the activation reason
   */
  public activateScheduled = async (
    symbol: string,
    currentPrice: number,
    isBacktest: boolean,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    timestamp: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
    activateId?: string,
  ) => {
    this.loggerService.log("strategyReportService activateScheduled", {
      symbol,
      currentPrice,
      isBacktest,
      activateId,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
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
    const createdAt = new Date(timestamp).toISOString();
    await Report.writeData(
      "strategy",
      {
        action: "activate-scheduled",
        activateId,
        currentPrice,
        symbol,
        timestamp,
        createdAt,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        originalPriceTakeProfit,
        originalPriceStopLoss,
        scheduledAt,
        pendingAt,
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
   * Initializes the service for event logging.
   *
   * Must be called before any events can be logged. Uses singleshot pattern
   * to ensure only one subscription exists at a time.
   *
   * @returns Cleanup function that clears the subscription when called
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("strategyReportService subscribe");

    const unCancelSchedule = strategyCommitSubject
      .filter(({ action }) => action === "cancel-scheduled")
      .connect(async (event: CancelScheduledCommit) =>
        await this.cancelScheduled(
          event.symbol,
          event.backtest,
          {
            exchangeName: event.exchangeName,
            frameName: event.frameName,
            strategyName: event.strategyName,
          },
          event.timestamp,
          event.cancelId,
        )
      );

    const unClosePending = strategyCommitSubject
      .filter(({ action }) => action === "close-pending")
      .connect(async (event: ClosePendingCommit) =>
        await this.closePending(
          event.symbol,
          event.backtest,
          {
            exchangeName: event.exchangeName,
            frameName: event.frameName,
            strategyName: event.strategyName,
          },
          event.timestamp,
          event.closeId,
        )
      );

    const unPartialProfit = strategyCommitSubject
      .filter(({ action }) => action === "partial-profit")
      .connect(async (event: PartialProfitCommit) =>
        await this.partialProfit(
          event.symbol,
          event.percentToClose,
          event.currentPrice,
          event.backtest,
          {
            exchangeName: event.exchangeName,
            frameName: event.frameName,
            strategyName: event.strategyName,
          },
          event.timestamp,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
        )
      );

    const unPartialLoss = strategyCommitSubject
      .filter(({ action }) => action === "partial-loss")
      .connect(async (event: PartialLossCommit) =>
        await this.partialLoss(
          event.symbol,
          event.percentToClose,
          event.currentPrice,
          event.backtest,
          {
            exchangeName: event.exchangeName,
            frameName: event.frameName,
            strategyName: event.strategyName,
          },
          event.timestamp,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
        )
      );

    const unTrailingStop = strategyCommitSubject
      .filter(({ action }) => action === "trailing-stop")
      .connect(async (event: TrailingStopCommit) =>
        await this.trailingStop(
          event.symbol,
          event.percentShift,
          event.currentPrice,
          event.backtest,
          {
            exchangeName: event.exchangeName,
            frameName: event.frameName,
            strategyName: event.strategyName,
          },
          event.timestamp,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
        )
      );

    const unTrailingTake = strategyCommitSubject
      .filter(({ action }) => action === "trailing-take")
      .connect(async (event: TrailingTakeCommit) =>
        await this.trailingTake(
          event.symbol,
          event.percentShift,
          event.currentPrice,
          event.backtest,
          {
            exchangeName: event.exchangeName,
            frameName: event.frameName,
            strategyName: event.strategyName,
          },
          event.timestamp,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
        )
      );

    const unBreakeven = strategyCommitSubject
      .filter(({ action }) => action === "breakeven")
      .connect(async (event: BreakevenCommit) =>
        await this.breakeven(
          event.symbol,
          event.currentPrice,
          event.backtest,
          {
            exchangeName: event.exchangeName,
            frameName: event.frameName,
            strategyName: event.strategyName,
          },
          event.timestamp,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
        )
      );

    const unActivateScheduled = strategyCommitSubject
      .filter(({ action }) => action === "activate-scheduled")
      .connect(async (event: ActivateScheduledCommit) =>
        await this.activateScheduled(
          event.symbol,
          event.currentPrice,
          event.backtest,
          {
            exchangeName: event.exchangeName,
            frameName: event.frameName,
            strategyName: event.strategyName,
          },
          event.timestamp,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
          event.activateId,
        )
      );

    const disposeFn = compose(
      () => unCancelSchedule(),
      () => unClosePending(),
      () => unPartialProfit(),
      () => unPartialLoss(),
      () => unTrailingStop(),
      () => unTrailingTake(),
      () => unBreakeven(),
      () => unActivateScheduled(),
    );

    return () => {
      disposeFn();
      this.subscribe.clear();
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
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default StrategyReportService;
