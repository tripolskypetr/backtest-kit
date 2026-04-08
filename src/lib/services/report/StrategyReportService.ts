import { inject } from "../../core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { ReportWriter } from "../../../classes/Writer";
import { compose, singleshot } from "functools-kit";
import { FrameName } from "../../../interfaces/Frame.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { IStrategyPnL, StrategyName } from "../../../interfaces/Strategy.interface";
import { strategyCommitSubject } from "../../../config/emitters";
import {
  ActivateScheduledCommit,
  AverageBuyCommit,
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
 * - Events are written via ReportWriter.writeData() with "strategy" category
 * - Call unsubscribe() to disable event logging
 *
 * @see StrategyMarkdownService for in-memory event accumulation and markdown report generation
 * @see Report for the underlying persistence mechanism
 */
export class StrategyReportService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Logs a cancel-scheduled event when a scheduled signal is cancelled.
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
    signalId: string,
    pnl: IStrategyPnL,
    totalPartials: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await ReportWriter.writeData(
      "strategy",
      {
        action: "cancel-scheduled",
        cancelId,
        symbol,
        timestamp,
        createdAt,
        pnlPercentage: pnl.pnlPercentage,
        pnlCost: pnl.pnlCost,
        pnlEntries: pnl.pnlEntries,
        pnlPriceOpen: pnl.priceOpen,
        pnlPriceClose: pnl.priceClose,
        totalPartials,
      },
      {
        signalId,
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
    signalId: string,
    pnl: IStrategyPnL,
    totalPartials: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await ReportWriter.writeData(
      "strategy",
      {
        action: "close-pending",
        closeId,
        symbol,
        timestamp,
        createdAt,
        pnlPercentage: pnl.pnlPercentage,
        pnlCost: pnl.pnlCost,
        pnlEntries: pnl.pnlEntries,
        pnlPriceOpen: pnl.priceOpen,
        pnlPriceClose: pnl.priceClose,
        totalPartials,
      },
      {
        signalId,
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
    signalId: string,
    pnl: IStrategyPnL,
    totalPartials: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
    totalEntries: number,
    originalPriceOpen: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await ReportWriter.writeData(
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
        originalPriceOpen,
        totalEntries,
        scheduledAt,
        pendingAt,
        pnlPercentage: pnl.pnlPercentage,
        pnlCost: pnl.pnlCost,
        pnlEntries: pnl.pnlEntries,
        pnlPriceOpen: pnl.priceOpen,
        pnlPriceClose: pnl.priceClose,
        totalPartials,
      },
      {
        signalId,
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
    signalId: string,
    pnl: IStrategyPnL,
    totalPartials: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
    totalEntries: number,
    originalPriceOpen: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await ReportWriter.writeData(
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
        originalPriceOpen,
        totalEntries,
        scheduledAt,
        pendingAt,
        pnlPercentage: pnl.pnlPercentage,
        pnlCost: pnl.pnlCost,
        pnlEntries: pnl.pnlEntries,
        pnlPriceOpen: pnl.priceOpen,
        pnlPriceClose: pnl.priceClose,
        totalPartials,
      },
      {
        signalId,
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
    signalId: string,
    pnl: IStrategyPnL,
    totalPartials: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
    totalEntries: number,
    originalPriceOpen: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await ReportWriter.writeData(
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
        originalPriceOpen,
        totalEntries,
        scheduledAt,
        pendingAt,
        pnlPercentage: pnl.pnlPercentage,
        pnlCost: pnl.pnlCost,
        pnlEntries: pnl.pnlEntries,
        pnlPriceOpen: pnl.priceOpen,
        pnlPriceClose: pnl.priceClose,
        totalPartials,
      },
      {
        signalId,
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
    signalId: string,
    pnl: IStrategyPnL,
    totalPartials: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
    totalEntries: number,
    originalPriceOpen: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await ReportWriter.writeData(
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
        originalPriceOpen,
        totalEntries,
        scheduledAt,
        pendingAt,
        pnlPercentage: pnl.pnlPercentage,
        pnlCost: pnl.pnlCost,
        pnlEntries: pnl.pnlEntries,
        pnlPriceOpen: pnl.priceOpen,
        pnlPriceClose: pnl.priceClose,
        totalPartials,
      },
      {
        signalId,
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
    signalId: string,
    pnl: IStrategyPnL,
    totalPartials: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
    totalEntries: number,
    originalPriceOpen: number,
  ) => {
    this.loggerService.log("strategyReportService breakeven", {
      symbol,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const createdAt = new Date(timestamp).toISOString();
    await ReportWriter.writeData(
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
        originalPriceOpen,
        totalEntries,
        scheduledAt,
        pendingAt,
        pnlPercentage: pnl.pnlPercentage,
        pnlCost: pnl.pnlCost,
        pnlEntries: pnl.pnlEntries,
        pnlPriceOpen: pnl.priceOpen,
        pnlPriceClose: pnl.priceClose,
        totalPartials,
      },
      {
        signalId,
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
    signalId: string,
    pnl: IStrategyPnL,
    totalPartials: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
    totalEntries: number,
    originalPriceOpen: number,
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
    const createdAt = new Date(timestamp).toISOString();
    await ReportWriter.writeData(
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
        originalPriceOpen,
        totalEntries,
        scheduledAt,
        pendingAt,
        pnlPercentage: pnl.pnlPercentage,
        pnlCost: pnl.pnlCost,
        pnlEntries: pnl.pnlEntries,
        pnlPriceOpen: pnl.priceOpen,
        pnlPriceClose: pnl.priceClose,
        totalPartials,
      },
      {
        signalId,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        strategyName: context.strategyName,
        symbol,
        walkerName: "",
      },
    );
  };

  /**
   * Logs an average-buy (DCA) event when a new averaging entry is added to an open position.
   */
  public averageBuy = async (
    symbol: string,
    currentPrice: number,
    effectivePriceOpen: number,
    totalEntries: number,
    isBacktest: boolean,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    timestamp: number,
    signalId: string,
    pnl: IStrategyPnL,
    totalPartials: number,
    cost: number,
    position: "long" | "short",
    priceOpen: number,
    priceTakeProfit: number,
    priceStopLoss: number,
    originalPriceTakeProfit: number,
    originalPriceStopLoss: number,
    scheduledAt: number,
    pendingAt: number,
    originalPriceOpen: number,
  ) => {
    this.loggerService.log("strategyReportService averageBuy", {
      symbol,
      currentPrice,
      effectivePriceOpen,
      totalEntries,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const createdAt = new Date(timestamp).toISOString();
    await ReportWriter.writeData(
      "strategy",
      {
        action: "average-buy",
        currentPrice,
        effectivePriceOpen,
        totalEntries,
        symbol,
        timestamp,
        createdAt,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        originalPriceTakeProfit,
        originalPriceStopLoss,
        originalPriceOpen,
        scheduledAt,
        pendingAt,
        pnlPercentage: pnl.pnlPercentage,
        pnlCost: pnl.pnlCost,
        pnlEntries: pnl.pnlEntries,
        pnlPriceOpen: pnl.priceOpen,
        pnlPriceClose: pnl.priceClose,
        totalPartials,
        cost,
      },
      {
        signalId,
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
          event.signalId,
          event.pnl,
          event.totalPartials,
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
          event.signalId,
          event.pnl,
          event.totalPartials,
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
          event.signalId,
          event.pnl,
          event.totalPartials,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
          event.totalEntries,
          event.originalPriceOpen,
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
          event.signalId,
          event.pnl,
          event.totalPartials,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
          event.totalEntries,
          event.originalPriceOpen,
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
          event.signalId,
          event.pnl,
          event.totalPartials,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
          event.totalEntries,
          event.originalPriceOpen,
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
          event.signalId,
          event.pnl,
          event.totalPartials,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
          event.totalEntries,
          event.originalPriceOpen,
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
          event.signalId,
          event.pnl,
          event.totalPartials,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
          event.totalEntries,
          event.originalPriceOpen,
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
          event.signalId,
          event.pnl,
          event.totalPartials,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
          event.totalEntries,
          event.originalPriceOpen,
          event.activateId,
        )
      );

    const unAverageBuy = strategyCommitSubject
      .filter(({ action }) => action === "average-buy")
      .connect(async (event: AverageBuyCommit) =>
        await this.averageBuy(
          event.symbol,
          event.currentPrice,
          event.effectivePriceOpen,
          event.totalEntries,
          event.backtest,
          {
            exchangeName: event.exchangeName,
            frameName: event.frameName,
            strategyName: event.strategyName,
          },
          event.timestamp,
          event.signalId,
          event.pnl,
          event.totalPartials,
          event.cost,
          event.position,
          event.priceOpen,
          event.priceTakeProfit,
          event.priceStopLoss,
          event.originalPriceTakeProfit,
          event.originalPriceStopLoss,
          event.scheduledAt,
          event.pendingAt,
          event.originalPriceOpen,
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
      () => unAverageBuy(),
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
