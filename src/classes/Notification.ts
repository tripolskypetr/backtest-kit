import { singleshot, randomString, errorData, getErrorMessage, compose } from "functools-kit";
import {
  signalEmitter,
  partialProfitSubject,
  partialLossSubject,
  breakevenSubject,
  riskSubject,
  errorEmitter,
  exitEmitter,
  validationSubject,
  strategyCommitSubject,
} from "../config/emitters";
import { NotificationModel } from "../model/Notification.model";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";
import { PartialProfitContract } from "../contract/PartialProfit.contract";
import { PartialLossContract } from "../contract/PartialLoss.contract";
import { BreakevenContract } from "../contract/Breakeven.contract";
import { RiskContract } from "../contract/Risk.contract";
import { StrategyCommitContract } from "../contract/StrategyCommit.contract";

/** Maximum number of notifications to store in history */
const MAX_NOTIFICATIONS = 250;

/** Function to create unique notification IDs */
const CREATE_KEY_FN = () => randomString();

/**
 * Instance class for notification history management.
 *
 * Contains all business logic for notification collection from emitters/subjects.
 * Stores notifications in chronological order with automatic limit management.
 *
 * @example
 * ```typescript
 * const instance = new NotificationInstance();
 * await instance.waitForInit();
 *
 * // Get all notifications
 * const all = instance.getData();
 *
 * // Process notifications with type discrimination
 * all.forEach(notification => {
 *   switch (notification.type) {
 *     case "signal.closed":
 *       console.log(`Closed: ${notification.pnlPercentage}%`);
 *       break;
 *     case "partial.loss":
 *       if (notification.level >= 30) {
 *         alert("High loss!");
 *       }
 *       break;
 *     case "risk.rejection":
 *       console.warn(notification.rejectionNote);
 *       break;
 *   }
 * });
 *
 * // Clear history
 * instance.clear();
 * ```
 */
export class NotificationInstance {
  /** Internal notification history storage (newest first) */
  private _notifications: NotificationModel[] = [];

  /**
   * Adds notification to history with automatic limit management.
   */
  private _addNotification(notification: NotificationModel): void {
    this._notifications.unshift(notification);

    // Trim history if exceeded MAX_NOTIFICATIONS
    if (this._notifications.length > MAX_NOTIFICATIONS) {
      this._notifications.pop();
    }
  }

  /**
   * Processes signal events and creates appropriate notifications.
   * Sorts signal notifications by createdAt to maintain chronological order.
   */
  private _handleSignal = async (data: IStrategyTickResult) => {
    if (data.action === "opened") {
      this._addNotification({
        type: "signal.opened",
        id: CREATE_KEY_FN(),
        timestamp: data.signal.pendingAt,
        backtest: data.backtest,
        symbol: data.symbol,
        strategyName: data.strategyName,
        exchangeName: data.exchangeName,
        signalId: data.signal.id,
        position: data.signal.position,
        priceOpen: data.signal.priceOpen,
        priceTakeProfit: data.signal.priceTakeProfit,
        priceStopLoss: data.signal.priceStopLoss,
        note: data.signal.note,
        createdAt: data.createdAt,
      });
    } else if (data.action === "closed") {
      const durationMs = data.closeTimestamp - data.signal.pendingAt;
      const durationMin = Math.round(durationMs / 60000);

      this._addNotification({
        type: "signal.closed",
        id: CREATE_KEY_FN(),
        timestamp: data.closeTimestamp,
        backtest: data.backtest,
        symbol: data.symbol,
        strategyName: data.strategyName,
        exchangeName: data.exchangeName,
        signalId: data.signal.id,
        position: data.signal.position,
        priceOpen: data.signal.priceOpen,
        priceClose: data.currentPrice,
        pnlPercentage: data.pnl.pnlPercentage,
        closeReason: data.closeReason,
        duration: durationMin,
        note: data.signal.note,
        createdAt: data.createdAt,
      });
    } else if (data.action === "scheduled") {
      this._addNotification({
        type: "signal.scheduled",
        id: CREATE_KEY_FN(),
        timestamp: data.signal.scheduledAt,
        backtest: data.backtest,
        symbol: data.symbol,
        strategyName: data.strategyName,
        exchangeName: data.exchangeName,
        signalId: data.signal.id,
        position: data.signal.position,
        priceOpen: data.signal.priceOpen,
        scheduledAt: data.signal.scheduledAt,
        currentPrice: data.currentPrice,
        createdAt: data.createdAt,
      });
    } else if (data.action === "cancelled") {
      const durationMs = data.closeTimestamp - data.signal.scheduledAt;
      const durationMin = Math.round(durationMs / 60000);

      this._addNotification({
        type: "signal.cancelled",
        id: CREATE_KEY_FN(),
        timestamp: data.closeTimestamp,
        backtest: data.backtest,
        symbol: data.symbol,
        strategyName: data.strategyName,
        exchangeName: data.exchangeName,
        signalId: data.signal.id,
        position: data.signal.position,
        cancelReason: data.reason,
        cancelId: data.cancelId,
        duration: durationMin,
        createdAt: data.createdAt,
      });
    }
  };

  /**
   * Processes partial profit events.
   */
  private _handlePartialProfit = async (data: PartialProfitContract) => {
    this._addNotification({
      type: "partial_profit.available",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.data.id,
      level: data.level,
      currentPrice: data.currentPrice,
      priceOpen: data.data.priceOpen,
      position: data.data.position,
      createdAt: data.timestamp,
    });
  };

  /**
   * Processes partial loss events.
   */
  private _handlePartialLoss = async (data: PartialLossContract) => {
    this._addNotification({
      type: "partial_loss.available",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.data.id,
      level: data.level,
      currentPrice: data.currentPrice,
      priceOpen: data.data.priceOpen,
      position: data.data.position,
      createdAt: data.timestamp,
    });
  };

  /**
   * Processes breakeven events.
   */
  private _handleBreakeven = async (data: BreakevenContract) => {
    this._addNotification({
      type: "breakeven.available",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.data.id,
      currentPrice: data.currentPrice,
      priceOpen: data.data.priceOpen,
      position: data.data.position,
      createdAt: data.timestamp,
    });
  };

  /**
   * Processes strategy commit events.
   */
  private _handleStrategyCommit = async (data: StrategyCommitContract) => {
    if (data.action === "partial-profit") {
      this._addNotification({
        type: "partial_profit.commit",
        id: CREATE_KEY_FN(),
        timestamp: Date.now(),
        backtest: data.backtest,
        symbol: data.symbol,
        strategyName: data.strategyName,
        exchangeName: data.exchangeName,
        percentToClose: data.percentToClose,
        currentPrice: data.currentPrice,
        createdAt: Date.now(),
      });
    } else if (data.action === "partial-loss") {
      this._addNotification({
        type: "partial_loss.commit",
        id: CREATE_KEY_FN(),
        timestamp: Date.now(),
        backtest: data.backtest,
        symbol: data.symbol,
        strategyName: data.strategyName,
        exchangeName: data.exchangeName,
        percentToClose: data.percentToClose,
        currentPrice: data.currentPrice,
        createdAt: Date.now(),
      });
    } else if (data.action === "breakeven") {
      this._addNotification({
        type: "breakeven.commit",
        id: CREATE_KEY_FN(),
        timestamp: Date.now(),
        backtest: data.backtest,
        symbol: data.symbol,
        strategyName: data.strategyName,
        exchangeName: data.exchangeName,
        currentPrice: data.currentPrice,
        createdAt: Date.now(),
      });
    } else if (data.action === "trailing-stop") {
      this._addNotification({
        type: "trailing_stop.commit",
        id: CREATE_KEY_FN(),
        timestamp: Date.now(),
        backtest: data.backtest,
        symbol: data.symbol,
        strategyName: data.strategyName,
        exchangeName: data.exchangeName,
        percentShift: data.percentShift,
        currentPrice: data.currentPrice,
        createdAt: Date.now(),
      });
    } else if (data.action === "trailing-take") {
      this._addNotification({
        type: "trailing_take.commit",
        id: CREATE_KEY_FN(),
        timestamp: Date.now(),
        backtest: data.backtest,
        symbol: data.symbol,
        strategyName: data.strategyName,
        exchangeName: data.exchangeName,
        percentShift: data.percentShift,
        currentPrice: data.currentPrice,
        createdAt: Date.now(),
      });
    }
  };

  /**
   * Processes risk rejection events.
   */
  private _handleRisk = async (data: RiskContract) => {
    this._addNotification({
      type: "risk.rejection",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      rejectionNote: data.rejectionNote,
      rejectionId: data.rejectionId,
      activePositionCount: data.activePositionCount,
      currentPrice: data.currentPrice,
      pendingSignal: data.pendingSignal,
      createdAt: data.timestamp,
    });
  };

  /**
   * Processes error events.
   */
  private _handleError = async (error: Error) => {
    this._addNotification({
      type: "error.info",
      id: CREATE_KEY_FN(),
      error: errorData(error),
      message: getErrorMessage(error),
      backtest: false,
    });
  };

  /**
   * Processes critical error events.
   */
  private _handleCriticalError = async (error: Error) => {
    this._addNotification({
      type: "error.critical",
      id: CREATE_KEY_FN(),
      error: errorData(error),
      message: getErrorMessage(error),
      backtest: false,
    });
  };

  /**
   * Processes validation error events.
   */
  private _handleValidationError = async (error: Error) => {
    this._addNotification({
      type: "error.validation",
      id: CREATE_KEY_FN(),
      error: errorData(error),
      message: getErrorMessage(error),
      backtest: false,
    });
  };

  /**
   * Returns all notifications in chronological order (newest first).
   *
   * @returns Array of strongly-typed notification objects
   *
   * @example
   * ```typescript
   * const notifications = instance.getData();
   *
   * notifications.forEach(notification => {
   *   switch (notification.type) {
   *     case "signal.closed":
   *       console.log(`${notification.symbol}: ${notification.pnlPercentage}%`);
   *       break;
   *     case "partial.loss":
   *       if (notification.level >= 30) {
   *         console.warn(`High loss: ${notification.symbol}`);
   *       }
   *       break;
   *   }
   * });
   * ```
   */
  public getData(): NotificationModel[] {
    return [...this._notifications];
  }

  /**
   * Clears all notification history.
   *
   * @example
   * ```typescript
   * instance.clear();
   * ```
   */
  public clear(): void {
    this._notifications = [];
  }

  /**
   * Subscribes to all notification emitters and returns an unsubscribe function.
   * Protected against multiple subscriptions using singleshot.
   *
   * @returns Unsubscribe function to stop receiving all notification events
   *
   * @example
   * ```typescript
   * const instance = new NotificationInstance();
   * const unsubscribe = instance.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public enable = singleshot(() => {

    const unSignal = signalEmitter.subscribe(this._handleSignal);
    const unProfit = partialProfitSubject.subscribe(this._handlePartialProfit);
    const unLoss = partialLossSubject.subscribe(this._handlePartialLoss);
    const unBreakeven = breakevenSubject.subscribe(this._handleBreakeven);
    const unStrategyCommit = strategyCommitSubject.subscribe(this._handleStrategyCommit);
    const unRisk = riskSubject.subscribe(this._handleRisk);
    const unError = errorEmitter.subscribe(this._handleError);
    const unExit = exitEmitter.subscribe(this._handleCriticalError);
    const unValidation = validationSubject.subscribe(this._handleValidationError);

    const disposeFn = compose(
      () => unSignal(),
      () => unProfit(),
      () => unLoss(),
      () => unBreakeven(),
      () => unStrategyCommit(),
      () => unRisk(),
      () => unError(),
      () => unExit(),
      () => unValidation(),
    );
    
    return () => {
      disposeFn();
      this.enable.clear();
    };
  });

  /**
   * Unsubscribes from all notification emitters to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const instance = new NotificationInstance();
   * instance.subscribe();
   * // ... later
   * instance.unsubscribe();
   * ```
   */
  public disable(): void {
    if (this.enable.hasValue()) {
      const unsubscribeFn = this.enable();
      unsubscribeFn();
    }
  }
}

/**
 * Public facade for notification operations.
 *
 * Automatically subscribes on first use and provides simplified access to notification instance methods.
 *
 * @example
 * ```typescript
 * import { Notification } from "./classes/Notification";
 *
 * // Get all notifications (auto-subscribes if not subscribed)
 * const all = await Notification.getData();
 *
 * // Process notifications with type discrimination
 * all.forEach(notification => {
 *   switch (notification.type) {
 *     case "signal.closed":
 *       console.log(`Closed: ${notification.pnlPercentage}%`);
 *       break;
 *     case "partial.loss":
 *       if (notification.level >= 30) {
 *         alert("High loss!");
 *       }
 *       break;
 *     case "risk.rejection":
 *       console.warn(notification.rejectionNote);
 *       break;
 *   }
 * });
 *
 * // Clear history
 * await Notification.clear();
 *
 * // Unsubscribe when done
 * await Notification.unsubscribe();
 * ```
 */
export class NotificationUtils {
  /** Internal instance containing business logic */
  private _instance = new NotificationInstance();

  /**
   * Returns all notifications in chronological order (newest first).
   * Automatically subscribes to emitters if not already subscribed.
   *
   * @returns Array of strongly-typed notification objects
   *
   * @example
   * ```typescript
   * const notifications = await Notification.getData();
   *
   * notifications.forEach(notification => {
   *   switch (notification.type) {
   *     case "signal.closed":
   *       console.log(`${notification.symbol}: ${notification.pnlPercentage}%`);
   *       break;
   *     case "partial.loss":
   *       if (notification.level >= 30) {
   *         console.warn(`High loss: ${notification.symbol}`);
   *       }
   *       break;
   *   }
   * });
   * ```
   */
  public async getData(): Promise<NotificationModel[]> {
    if (!this._instance.enable.hasValue()) {
      throw new Error("Notification not initialized. Call enable() before getting data.");
    }
    return this._instance.getData();
  }

  /**
   * Clears all notification history.
   * Automatically subscribes to emitters if not already subscribed.
   *
   * @example
   * ```typescript
   * await Notification.clear();
   * ```
   */
  public async clear(): Promise<void> {
    if (!this._instance.enable.hasValue()) {
      throw new Error("Notification not initialized. Call enable() before clearing data.");
    }
    this._instance.clear();
  }

  /**
   * Unsubscribes from all notification emitters.
   * Call this when you no longer need to collect notifications.
   *
   * @example
   * ```typescript
   * await Notification.unsubscribe();
   * ```
   */
  public async enable(): Promise<void> {
    this._instance.enable();
  }

  /**
   * Unsubscribes from all notification emitters.
   * Call this when you no longer need to collect notifications.
   * @example
   * ```typescript
   * await Notification.unsubscribe();
   * ```
   */
  public async disable(): Promise<void> {
    this._instance.disable();
  }
}

/**
 * Singleton instance of NotificationUtils for convenient notification access.
 *
 * @example
 * ```typescript
 * import { Notification } from "./classes/Notification";
 *
 * // Get all notifications
 * const all = await Notification.getData();
 *
 * // Filter by type using type discrimination
 * const closedSignals = all.filter(n => n.type === "signal.closed");
 * const highLosses = all.filter(n =>
 *   n.type === "partial.loss" && n.level >= 30
 * );
 *
 * // Clear history
 * await Notification.clear();
 * ```
 */
export const Notification = new NotificationUtils();
