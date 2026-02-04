import { singleshot, randomString, errorData, getErrorMessage, compose } from "functools-kit";
import {
  signalBacktestEmitter,
  signalLiveEmitter,
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
import backtest from "../lib";
import { PersistNotificationAdapter } from "./Persist";

/**
 * Maximum number of notifications to keep in storage.
 * Older notifications are removed when this limit is exceeded.
 */
const MAX_NOTIFICATIONS = 250;

/**
 * Generates a unique key for notification identification.
 * @returns Random string identifier
 */
const CREATE_KEY_FN = () => randomString();

/**
 * Creates a notification model from signal tick result.
 * Handles opened, closed, scheduled, and cancelled signal actions.
 * @param data - The strategy tick result data
 * @returns NotificationModel or null if action is not recognized
 */
const CREATE_SIGNAL_NOTIFICATION_FN = (data: IStrategyTickResult): NotificationModel | null => {
  if (data.action === "opened") {
    return {
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
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      note: data.signal.note,
      scheduledAt: data.signal.scheduledAt,
      pendingAt: data.signal.pendingAt,
      createdAt: data.createdAt,
    };
  } 
  if (data.action === "closed") {
    const durationMs = data.closeTimestamp - data.signal.pendingAt;
    const durationMin = Math.round(durationMs / 60000);

    return {
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
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      pnlPercentage: data.pnl.pnlPercentage,
      closeReason: data.closeReason,
      duration: durationMin,
      note: data.signal.note,
      scheduledAt: data.signal.scheduledAt,
      pendingAt: data.signal.pendingAt,
      createdAt: data.createdAt,
    };
  } 
  if (data.action === "scheduled") {
    return {
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
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      scheduledAt: data.signal.scheduledAt,
      currentPrice: data.currentPrice,
      createdAt: data.createdAt,
    };
  } 
  if (data.action === "cancelled") {
    const durationMs = data.closeTimestamp - data.signal.scheduledAt;
    const durationMin = Math.round(durationMs / 60000);

    return {
      type: "signal.cancelled",
      id: CREATE_KEY_FN(),
      timestamp: data.closeTimestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.signal.id,
      position: data.signal.position,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      cancelReason: data.reason,
      cancelId: data.cancelId,
      duration: durationMin,
      scheduledAt: data.signal.scheduledAt,
      pendingAt: data.signal.pendingAt,
      createdAt: data.createdAt,
    };
  }
  return null;
};

/**
 * Creates a notification model for partial profit availability.
 * @param data - The partial profit contract data
 * @returns NotificationModel for partial profit event
 */
const CREATE_PARTIAL_PROFIT_NOTIFICATION_FN = (data: PartialProfitContract): NotificationModel => ({
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
  priceTakeProfit: data.data.priceTakeProfit,
  priceStopLoss: data.data.priceStopLoss,
  originalPriceTakeProfit: data.data.originalPriceTakeProfit,
  originalPriceStopLoss: data.data.originalPriceStopLoss,
  scheduledAt: data.data.scheduledAt,
  pendingAt: data.data.pendingAt,
  createdAt: data.timestamp,
});

/**
 * Creates a notification model for partial loss availability.
 * @param data - The partial loss contract data
 * @returns NotificationModel for partial loss event
 */
const CREATE_PARTIAL_LOSS_NOTIFICATION_FN = (data: PartialLossContract): NotificationModel => ({
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
  priceTakeProfit: data.data.priceTakeProfit,
  priceStopLoss: data.data.priceStopLoss,
  originalPriceTakeProfit: data.data.originalPriceTakeProfit,
  originalPriceStopLoss: data.data.originalPriceStopLoss,
  scheduledAt: data.data.scheduledAt,
  pendingAt: data.data.pendingAt,
  createdAt: data.timestamp,
});

/**
 * Creates a notification model for breakeven availability.
 * @param data - The breakeven contract data
 * @returns NotificationModel for breakeven event
 */
const CREATE_BREAKEVEN_NOTIFICATION_FN = (data: BreakevenContract): NotificationModel => ({
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
  priceTakeProfit: data.data.priceTakeProfit,
  priceStopLoss: data.data.priceStopLoss,
  originalPriceTakeProfit: data.data.originalPriceTakeProfit,
  originalPriceStopLoss: data.data.originalPriceStopLoss,
  scheduledAt: data.data.scheduledAt,
  pendingAt: data.data.pendingAt,
  createdAt: data.timestamp,
});

/**
 * Creates a notification model for strategy commit events.
 * Handles partial-profit, partial-loss, breakeven, trailing-stop,
 * trailing-take, and activate-scheduled actions.
 * @param data - The strategy commit contract data
 * @returns NotificationModel or null if action is not recognized
 */
const CREATE_STRATEGY_COMMIT_NOTIFICATION_FN = (data: StrategyCommitContract): NotificationModel | null => {
  if (data.action === "partial-profit") {
    return {
      type: "partial_profit.commit",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.signalId,
      percentToClose: data.percentToClose,
      currentPrice: data.currentPrice,
      position: data.position,
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      originalPriceTakeProfit: data.originalPriceTakeProfit,
      originalPriceStopLoss: data.originalPriceStopLoss,
      scheduledAt: data.scheduledAt,
      pendingAt: data.pendingAt,
      createdAt: data.timestamp,
    };
  } 
  if (data.action === "partial-loss") {
    return {
      type: "partial_loss.commit",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.signalId,
      percentToClose: data.percentToClose,
      currentPrice: data.currentPrice,
      position: data.position,
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      originalPriceTakeProfit: data.originalPriceTakeProfit,
      originalPriceStopLoss: data.originalPriceStopLoss,
      scheduledAt: data.scheduledAt,
      pendingAt: data.pendingAt,
      createdAt: data.timestamp,
    };
  } 
  if (data.action === "breakeven") {
    return {
      type: "breakeven.commit",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.signalId,
      currentPrice: data.currentPrice,
      position: data.position,
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      originalPriceTakeProfit: data.originalPriceTakeProfit,
      originalPriceStopLoss: data.originalPriceStopLoss,
      scheduledAt: data.scheduledAt,
      pendingAt: data.pendingAt,
      createdAt: data.timestamp,
    };
  } 
  if (data.action === "trailing-stop") {
    return {
      type: "trailing_stop.commit",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.signalId,
      percentShift: data.percentShift,
      currentPrice: data.currentPrice,
      position: data.position,
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      originalPriceTakeProfit: data.originalPriceTakeProfit,
      originalPriceStopLoss: data.originalPriceStopLoss,
      scheduledAt: data.scheduledAt,
      pendingAt: data.pendingAt,
      createdAt: data.timestamp,
    };
  } 
  if (data.action === "trailing-take") {
    return {
      type: "trailing_take.commit",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.signalId,
      percentShift: data.percentShift,
      currentPrice: data.currentPrice,
      position: data.position,
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      originalPriceTakeProfit: data.originalPriceTakeProfit,
      originalPriceStopLoss: data.originalPriceStopLoss,
      scheduledAt: data.scheduledAt,
      pendingAt: data.pendingAt,
      createdAt: data.timestamp,
    };
  } 
  if (data.action === "activate-scheduled") {
    return {
      type: "activate_scheduled.commit",
      id: CREATE_KEY_FN(),
      timestamp: data.timestamp,
      backtest: data.backtest,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      signalId: data.signalId,
      activateId: data.activateId,
      currentPrice: data.currentPrice,
      position: data.position,
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      originalPriceTakeProfit: data.originalPriceTakeProfit,
      originalPriceStopLoss: data.originalPriceStopLoss,
      scheduledAt: data.scheduledAt,
      pendingAt: data.pendingAt,
      createdAt: data.timestamp,
    };
  }
  return null;
};

/**
 * Creates a notification model for risk rejection events.
 * @param data - The risk contract data
 * @returns NotificationModel for risk rejection event
 */
const CREATE_RISK_NOTIFICATION_FN = (data: RiskContract): NotificationModel => ({
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
  signalId: data.currentSignal.id,
  position: data.currentSignal.position,
  priceOpen: data.currentSignal.priceOpen,
  priceTakeProfit: data.currentSignal.priceTakeProfit,
  priceStopLoss: data.currentSignal.priceStopLoss,
  minuteEstimatedTime: data.currentSignal.minuteEstimatedTime,
  signalNote: data.currentSignal.note,
  createdAt: data.timestamp,
});

/**
 * Creates a notification model for error events.
 * @param error - The error object
 * @returns NotificationModel for error event
 */
const CREATE_ERROR_NOTIFICATION_FN = (error: Error): NotificationModel => ({
  type: "error.info",
  id: CREATE_KEY_FN(),
  error: errorData(error),
  message: getErrorMessage(error),
  backtest: false,
});

/**
 * Creates a notification model for critical error events.
 * @param error - The error object
 * @returns NotificationModel for critical error event
 */
const CREATE_CRITICAL_ERROR_NOTIFICATION_FN = (error: Error): NotificationModel => ({
  type: "error.critical",
  id: CREATE_KEY_FN(),
  error: errorData(error),
  message: getErrorMessage(error),
  backtest: false,
});

/**
 * Creates a notification model for validation error events.
 * @param error - The error object
 * @returns NotificationModel for validation error event
 */
const CREATE_VALIDATION_ERROR_NOTIFICATION_FN = (error: Error): NotificationModel => ({
  type: "error.validation",
  id: CREATE_KEY_FN(),
  error: errorData(error),
  message: getErrorMessage(error),
  backtest: false,
});

const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_SIGNAL = "NotificationMemoryBacktestUtils.handleSignal";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_PROFIT = "NotificationMemoryBacktestUtils.handlePartialProfit";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_LOSS = "NotificationMemoryBacktestUtils.handlePartialLoss";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_BREAKEVEN = "NotificationMemoryBacktestUtils.handleBreakeven";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_STRATEGY_COMMIT = "NotificationMemoryBacktestUtils.handleStrategyCommit";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_RISK = "NotificationMemoryBacktestUtils.handleRisk";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_ERROR = "NotificationMemoryBacktestUtils.handleError";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_CRITICAL_ERROR = "NotificationMemoryBacktestUtils.handleCriticalError";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_VALIDATION_ERROR = "NotificationMemoryBacktestUtils.handleValidationError";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_GET_DATA = "NotificationMemoryBacktestUtils.getData";
const NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_CLEAR = "NotificationMemoryBacktestUtils.clear";

const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_SIGNAL = "NotificationMemoryLiveUtils.handleSignal";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_PARTIAL_PROFIT = "NotificationMemoryLiveUtils.handlePartialProfit";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_PARTIAL_LOSS = "NotificationMemoryLiveUtils.handlePartialLoss";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_BREAKEVEN = "NotificationMemoryLiveUtils.handleBreakeven";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_STRATEGY_COMMIT = "NotificationMemoryLiveUtils.handleStrategyCommit";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_RISK = "NotificationMemoryLiveUtils.handleRisk";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_ERROR = "NotificationMemoryLiveUtils.handleError";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_CRITICAL_ERROR = "NotificationMemoryLiveUtils.handleCriticalError";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_VALIDATION_ERROR = "NotificationMemoryLiveUtils.handleValidationError";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_GET_DATA = "NotificationMemoryLiveUtils.getData";
const NOTIFICATION_MEMORY_LIVE_METHOD_NAME_CLEAR = "NotificationMemoryLiveUtils.clear";

const NOTIFICATION_ADAPTER_METHOD_NAME_ENABLE = "NotificationAdapter.enable";
const NOTIFICATION_ADAPTER_METHOD_NAME_DISABLE = "NotificationAdapter.disable";
const NOTIFICATION_ADAPTER_METHOD_NAME_GET_DATA_BACKTEST = "NotificationAdapter.getDataBacktest";
const NOTIFICATION_ADAPTER_METHOD_NAME_GET_DATA_LIVE = "NotificationAdapter.getDataLive";
const NOTIFICATION_ADAPTER_METHOD_NAME_CLEAR_BACKTEST = "NotificationAdapter.clearBacktest";
const NOTIFICATION_ADAPTER_METHOD_NAME_CLEAR_LIVE = "NotificationAdapter.clearLive";

const NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER = "NotificationBacktestAdapter.useNotificationAdapter";
const NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY = "NotificationBacktestAdapter.useDummy";
const NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_MEMORY = "NotificationBacktestAdapter.useMemory";
const NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST = "NotificationBacktestAdapter.usePersist";

const NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER = "NotificationLiveAdapter.useNotificationAdapter";
const NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY = "NotificationLiveAdapter.useDummy";
const NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_MEMORY = "NotificationLiveAdapter.useMemory";
const NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST = "NotificationLiveAdapter.usePersist";

const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_WAIT_FOR_INIT = "NotificationPersistBacktestUtils.waitForInit";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_UPDATE_NOTIFICATIONS = "NotificationPersistBacktestUtils._updateNotifications";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_SIGNAL = "NotificationPersistBacktestUtils.handleSignal";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_PROFIT = "NotificationPersistBacktestUtils.handlePartialProfit";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_LOSS = "NotificationPersistBacktestUtils.handlePartialLoss";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_BREAKEVEN = "NotificationPersistBacktestUtils.handleBreakeven";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_STRATEGY_COMMIT = "NotificationPersistBacktestUtils.handleStrategyCommit";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_RISK = "NotificationPersistBacktestUtils.handleRisk";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_ERROR = "NotificationPersistBacktestUtils.handleError";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_CRITICAL_ERROR = "NotificationPersistBacktestUtils.handleCriticalError";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_VALIDATION_ERROR = "NotificationPersistBacktestUtils.handleValidationError";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_GET_DATA = "NotificationPersistBacktestUtils.getData";
const NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_CLEAR = "NotificationPersistBacktestUtils.clear";

const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_WAIT_FOR_INIT = "NotificationPersistLiveUtils.waitForInit";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_UPDATE_NOTIFICATIONS = "NotificationPersistLiveUtils._updateNotifications";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_SIGNAL = "NotificationPersistLiveUtils.handleSignal";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_PARTIAL_PROFIT = "NotificationPersistLiveUtils.handlePartialProfit";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_PARTIAL_LOSS = "NotificationPersistLiveUtils.handlePartialLoss";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_BREAKEVEN = "NotificationPersistLiveUtils.handleBreakeven";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_STRATEGY_COMMIT = "NotificationPersistLiveUtils.handleStrategyCommit";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_RISK = "NotificationPersistLiveUtils.handleRisk";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_ERROR = "NotificationPersistLiveUtils.handleError";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_CRITICAL_ERROR = "NotificationPersistLiveUtils.handleCriticalError";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_VALIDATION_ERROR = "NotificationPersistLiveUtils.handleValidationError";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_GET_DATA = "NotificationPersistLiveUtils.getData";
const NOTIFICATION_PERSIST_LIVE_METHOD_NAME_CLEAR = "NotificationPersistLiveUtils.clear";

/**
 * Base interface for notification adapters.
 * All notification adapters must implement this interface.
 */
export interface INotificationUtils {
  /**
   * Handles signal events (opened, closed, scheduled, cancelled).
   * @param data - The strategy tick result data
   */
  handleSignal(data: IStrategyTickResult): Promise<void>;
  /**
   * Handles partial profit availability event.
   * @param data - The partial profit contract data
   */
  handlePartialProfit(data: PartialProfitContract): Promise<void>;
  /**
   * Handles partial loss availability event.
   * @param data - The partial loss contract data
   */
  handlePartialLoss(data: PartialLossContract): Promise<void>;
  /**
   * Handles breakeven availability event.
   * @param data - The breakeven contract data
   */
  handleBreakeven(data: BreakevenContract): Promise<void>;
  /**
   * Handles strategy commit events (partial-profit, breakeven, trailing, etc.).
   * @param data - The strategy commit contract data
   */
  handleStrategyCommit(data: StrategyCommitContract): Promise<void>;
  /**
   * Handles risk rejection event.
   * @param data - The risk contract data
   */
  handleRisk(data: RiskContract): Promise<void>;
  /**
   * Handles error event.
   * @param error - The error object
   */
  handleError(error: Error): Promise<void>;
  /**
   * Handles critical error event.
   * @param error - The error object
   */
  handleCriticalError(error: Error): Promise<void>;
  /**
   * Handles validation error event.
   * @param error - The error object
   */
  handleValidationError(error: Error): Promise<void>;
  /**
   * Gets all stored notifications.
   * @returns Array of all notification models
   */
  getData(): Promise<NotificationModel[]>;
  /**
   * Clears all stored notifications.
   */
  clear(): Promise<void>;
}

/**
 * Constructor type for notification adapters.
 * Used for custom notification implementations.
 */
export type TNotificationUtilsCtor = new () => INotificationUtils;

/**
 * In-memory notification adapter for backtest signals.
 *
 * Features:
 * - Stores notifications in memory only (no persistence)
 * - Fast read/write operations
 * - Data is lost when application restarts
 * - Maintains up to MAX_NOTIFICATIONS (250) most recent notifications
 * - Handles all notification types: signals, partial profit/loss, breakeven, risk, errors
 *
 * Use this adapter for testing or when persistence is not required.
 */
export class NotificationMemoryBacktestUtils implements INotificationUtils {
  /** Array of notification models */
  private _notifications: NotificationModel[] = [];

  /**
   * Adds a notification to the beginning of the list.
   * Removes oldest notification if limit is exceeded.
   * @param notification - The notification model to add
   */
  private _addNotification(notification: NotificationModel): void {
    this._notifications.unshift(notification);
    if (this._notifications.length > MAX_NOTIFICATIONS) {
      this._notifications.pop();
    }
  }

  /**
   * Handles signal events.
   * Creates and stores notification for opened, closed, scheduled, cancelled signals.
   * @param data - The strategy tick result data
   */
  public handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_SIGNAL, {
      signalId: data.signal?.id,
      action: data.action,
    });
    const notification = CREATE_SIGNAL_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
    }
  };

  /**
   * Handles partial profit availability event.
   * @param data - The partial profit contract data
   */
  public handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_PROFIT, {
      signalId: data.data.id,
      level: data.level,
    });
    this._addNotification(CREATE_PARTIAL_PROFIT_NOTIFICATION_FN(data));
  };

  /**
   * Handles partial loss availability event.
   * @param data - The partial loss contract data
   */
  public handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_LOSS, {
      signalId: data.data.id,
      level: data.level,
    });
    this._addNotification(CREATE_PARTIAL_LOSS_NOTIFICATION_FN(data));
  };

  /**
   * Handles breakeven availability event.
   * @param data - The breakeven contract data
   */
  public handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_BREAKEVEN, {
      signalId: data.data.id,
    });
    this._addNotification(CREATE_BREAKEVEN_NOTIFICATION_FN(data));
  };

  /**
   * Handles strategy commit events.
   * @param data - The strategy commit contract data
   */
  public handleStrategyCommit = async (data: StrategyCommitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_STRATEGY_COMMIT, {
      signalId: data.signalId,
      action: data.action,
    });
    const notification = CREATE_STRATEGY_COMMIT_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
    }
  };

  /**
   * Handles risk rejection event.
   * @param data - The risk contract data
   */
  public handleRisk = async (data: RiskContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_RISK, {
      signalId: data.currentSignal.id,
      rejectionId: data.rejectionId,
    });
    this._addNotification(CREATE_RISK_NOTIFICATION_FN(data));
  };

  /**
   * Handles error event.
   * @param error - The error object
   */
  public handleError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_ERROR, {
      message: getErrorMessage(error),
    });
    this._addNotification(CREATE_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Handles critical error event.
   * @param error - The error object
   */
  public handleCriticalError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_CRITICAL_ERROR, {
      message: getErrorMessage(error),
    });
    this._addNotification(CREATE_CRITICAL_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Handles validation error event.
   * @param error - The error object
   */
  public handleValidationError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_VALIDATION_ERROR, {
      message: getErrorMessage(error),
    });
    this._addNotification(CREATE_VALIDATION_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Gets all stored notifications.
   * @returns Copy of notifications array
   */
  public getData = async (): Promise<NotificationModel[]> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_GET_DATA);
    return [...this._notifications];
  };

  /**
   * Clears all stored notifications.
   */
  public clear = async (): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_CLEAR);
    this._notifications = [];
  };
}

/**
 * Dummy notification adapter for backtest signals that discards all writes.
 *
 * Features:
 * - No-op implementation for all methods
 * - getData always returns empty array
 *
 * Use this adapter to disable backtest notification storage completely.
 */
export class NotificationDummyBacktestUtils implements INotificationUtils {
  /**
   * No-op handler for signal events.
   */
  public handleSignal = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for partial profit event.
   */
  public handlePartialProfit = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for partial loss event.
   */
  public handlePartialLoss = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for breakeven event.
   */
  public handleBreakeven = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for strategy commit event.
   */
  public handleStrategyCommit = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for risk rejection event.
   */
  public handleRisk = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for error event.
   */
  public handleError = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for critical error event.
   */
  public handleCriticalError = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for validation error event.
   */
  public handleValidationError = async (): Promise<void> => {
    void 0;
  };

  /**
   * Always returns empty array (no storage).
   * @returns Empty array
   */
  public getData = async (): Promise<NotificationModel[]> => {
    return [];
  };

  /**
   * No-op clear operation.
   */
  public clear = async (): Promise<void> => {
    void 0;
  };
}

/**
 * Persistent notification adapter for backtest signals.
 *
 * Features:
 * - Persists notifications to disk using PersistNotificationAdapter
 * - Lazy initialization with singleshot pattern
 * - Maintains up to MAX_NOTIFICATIONS (250) most recent notifications
 * - Handles all notification types: signals, partial profit/loss, breakeven, risk, errors
 *
 * Use this adapter (default) for backtest notification persistence across sessions.
 */
export class NotificationPersistBacktestUtils implements INotificationUtils {
  /** Map of notification IDs to notification models */
  private _notifications: Map<string, NotificationModel>;

  /**
   * Singleshot initialization function that loads notifications from disk.
   * Protected by singleshot to ensure one-time execution.
   */
  private waitForInit = singleshot(async () => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_WAIT_FOR_INIT);
    const notificationList = await PersistNotificationAdapter.readNotificationData(true);
    notificationList.sort((a, b) => {
      const aTime = 'createdAt' in a ? a.createdAt : 0;
      const bTime = 'createdAt' in b ? b.createdAt : 0;
      return aTime - bTime;
    });
    this._notifications = new Map(
      notificationList
        .slice(-MAX_NOTIFICATIONS)
        .map((notification) => [notification.id, notification]),
    );
  });

  /**
   * Persists the current notification map to disk storage.
   * Sorts notifications by createdAt and keeps only the most recent MAX_NOTIFICATIONS.
   * @throws Error if not initialized
   */
  private async _updateNotifications(): Promise<void> {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_UPDATE_NOTIFICATIONS);
    if (!this._notifications) {
      throw new Error(
        "NotificationPersistBacktestUtils not initialized. Call waitForInit first.",
      );
    }
    const notificationList = Array.from(this._notifications.values());
    notificationList.sort((a, b) => {
      const aTime = 'createdAt' in a ? a.createdAt : 0;
      const bTime = 'createdAt' in b ? b.createdAt : 0;
      return aTime - bTime;
    });
    await PersistNotificationAdapter.writeNotificationData(
      notificationList.slice(-MAX_NOTIFICATIONS),
      true,
    );
  }

  /**
   * Adds a notification to the map.
   * Removes oldest notification if limit is exceeded.
   * @param notification - The notification model to add
   */
  private _addNotification(notification: NotificationModel): void {
    this._notifications.set(notification.id, notification);
    if (this._notifications.size > MAX_NOTIFICATIONS) {
      const firstKey = this._notifications.keys().next().value;
      if (firstKey) {
        this._notifications.delete(firstKey);
      }
    }
  }

  /**
   * Handles signal events.
   * Creates and stores notification for opened, closed, scheduled, cancelled signals.
   * @param data - The strategy tick result data
   */
  public handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_SIGNAL, {
      signalId: data.signal?.id,
      action: data.action,
    });
    await this.waitForInit();
    const notification = CREATE_SIGNAL_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
      await this._updateNotifications();
    }
  };

  /**
   * Handles partial profit availability event.
   * @param data - The partial profit contract data
   */
  public handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_PROFIT, {
      signalId: data.data.id,
      level: data.level,
    });
    await this.waitForInit();
    this._addNotification(CREATE_PARTIAL_PROFIT_NOTIFICATION_FN(data));
    await this._updateNotifications();
  };

  /**
   * Handles partial loss availability event.
   * @param data - The partial loss contract data
   */
  public handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_LOSS, {
      signalId: data.data.id,
      level: data.level,
    });
    await this.waitForInit();
    this._addNotification(CREATE_PARTIAL_LOSS_NOTIFICATION_FN(data));
    await this._updateNotifications();
  };

  /**
   * Handles breakeven availability event.
   * @param data - The breakeven contract data
   */
  public handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_BREAKEVEN, {
      signalId: data.data.id,
    });
    await this.waitForInit();
    this._addNotification(CREATE_BREAKEVEN_NOTIFICATION_FN(data));
    await this._updateNotifications();
  };

  /**
   * Handles strategy commit events.
   * @param data - The strategy commit contract data
   */
  public handleStrategyCommit = async (data: StrategyCommitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_STRATEGY_COMMIT, {
      signalId: data.signalId,
      action: data.action,
    });
    await this.waitForInit();
    const notification = CREATE_STRATEGY_COMMIT_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
      await this._updateNotifications();
    }
  };

  /**
   * Handles risk rejection event.
   * @param data - The risk contract data
   */
  public handleRisk = async (data: RiskContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_RISK, {
      signalId: data.currentSignal.id,
      rejectionId: data.rejectionId,
    });
    await this.waitForInit();
    this._addNotification(CREATE_RISK_NOTIFICATION_FN(data));
    await this._updateNotifications();
  };

  /**
   * Handles error event.
   * Note: Error notifications are not persisted to disk.
   * @param error - The error object
   */
  public handleError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_ERROR, {
      message: getErrorMessage(error),
    });
    await this.waitForInit();
    this._addNotification(CREATE_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Handles critical error event.
   * Note: Error notifications are not persisted to disk.
   * @param error - The error object
   */
  public handleCriticalError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_CRITICAL_ERROR, {
      message: getErrorMessage(error),
    });
    await this.waitForInit();
    this._addNotification(CREATE_CRITICAL_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Handles validation error event.
   * Note: Error notifications are not persisted to disk.
   * @param error - The error object
   */
  public handleValidationError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_HANDLE_VALIDATION_ERROR, {
      message: getErrorMessage(error),
    });
    await this.waitForInit();
    this._addNotification(CREATE_VALIDATION_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Gets all stored notifications.
   * @returns Array of all notification models
   */
  public getData = async (): Promise<NotificationModel[]> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_GET_DATA);
    await this.waitForInit();
    return Array.from(this._notifications.values());
  };

  /**
   * Clears all stored notifications.
   */
  public clear = async (): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_BACKTEST_METHOD_NAME_CLEAR);
    await this.waitForInit();
    this._notifications.clear();
    await this._updateNotifications();
  };
}

/**
 * In-memory notification adapter for live trading signals.
 *
 * Features:
 * - Stores notifications in memory only (no persistence)
 * - Fast read/write operations
 * - Data is lost when application restarts
 * - Maintains up to MAX_NOTIFICATIONS (250) most recent notifications
 * - Handles all notification types: signals, partial profit/loss, breakeven, risk, errors
 *
 * Use this adapter for testing or when persistence is not required.
 */
export class NotificationMemoryLiveUtils implements INotificationUtils {
  /** Array of notification models */
  private _notifications: NotificationModel[] = [];

  /**
   * Adds a notification to the beginning of the list.
   * Removes oldest notification if limit is exceeded.
   * @param notification - The notification model to add
   */
  private _addNotification(notification: NotificationModel): void {
    this._notifications.unshift(notification);
    if (this._notifications.length > MAX_NOTIFICATIONS) {
      this._notifications.pop();
    }
  }

  /**
   * Handles signal events.
   * Creates and stores notification for opened, closed, scheduled, cancelled signals.
   * @param data - The strategy tick result data
   */
  public handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_SIGNAL, {
      signalId: data.signal?.id,
      action: data.action,
    });
    const notification = CREATE_SIGNAL_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
    }
  };

  /**
   * Handles partial profit availability event.
   * @param data - The partial profit contract data
   */
  public handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_PARTIAL_PROFIT, {
      signalId: data.data.id,
      level: data.level,
    });
    this._addNotification(CREATE_PARTIAL_PROFIT_NOTIFICATION_FN(data));
  };

  /**
   * Handles partial loss availability event.
   * @param data - The partial loss contract data
   */
  public handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_PARTIAL_LOSS, {
      signalId: data.data.id,
      level: data.level,
    });
    this._addNotification(CREATE_PARTIAL_LOSS_NOTIFICATION_FN(data));
  };

  /**
   * Handles breakeven availability event.
   * @param data - The breakeven contract data
   */
  public handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_BREAKEVEN, {
      signalId: data.data.id,
    });
    this._addNotification(CREATE_BREAKEVEN_NOTIFICATION_FN(data));
  };

  /**
   * Handles strategy commit events.
   * @param data - The strategy commit contract data
   */
  public handleStrategyCommit = async (data: StrategyCommitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_STRATEGY_COMMIT, {
      signalId: data.signalId,
      action: data.action,
    });
    const notification = CREATE_STRATEGY_COMMIT_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
    }
  };

  /**
   * Handles risk rejection event.
   * @param data - The risk contract data
   */
  public handleRisk = async (data: RiskContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_RISK, {
      signalId: data.currentSignal.id,
      rejectionId: data.rejectionId,
    });
    this._addNotification(CREATE_RISK_NOTIFICATION_FN(data));
  };

  /**
   * Handles error event.
   * @param error - The error object
   */
  public handleError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_ERROR, {
      message: getErrorMessage(error),
    });
    this._addNotification(CREATE_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Handles critical error event.
   * @param error - The error object
   */
  public handleCriticalError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_CRITICAL_ERROR, {
      message: getErrorMessage(error),
    });
    this._addNotification(CREATE_CRITICAL_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Handles validation error event.
   * @param error - The error object
   */
  public handleValidationError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_VALIDATION_ERROR, {
      message: getErrorMessage(error),
    });
    this._addNotification(CREATE_VALIDATION_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Gets all stored notifications.
   * @returns Copy of notifications array
   */
  public getData = async (): Promise<NotificationModel[]> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_GET_DATA);
    return [...this._notifications];
  };

  /**
   * Clears all stored notifications.
   */
  public clear = async (): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_CLEAR);
    this._notifications = [];
  };
}

/**
 * Dummy notification adapter for live trading signals that discards all writes.
 *
 * Features:
 * - No-op implementation for all methods
 * - getData always returns empty array
 *
 * Use this adapter to disable live notification storage completely.
 */
export class NotificationDummyLiveUtils implements INotificationUtils {
  /**
   * No-op handler for signal events.
   */
  public handleSignal = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for partial profit event.
   */
  public handlePartialProfit = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for partial loss event.
   */
  public handlePartialLoss = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for breakeven event.
   */
  public handleBreakeven = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for strategy commit event.
   */
  public handleStrategyCommit = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for risk rejection event.
   */
  public handleRisk = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for error event.
   */
  public handleError = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for critical error event.
   */
  public handleCriticalError = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for validation error event.
   */
  public handleValidationError = async (): Promise<void> => {
    void 0;
  };

  /**
   * Always returns empty array (no storage).
   * @returns Empty array
   */
  public getData = async (): Promise<NotificationModel[]> => {
    return [];
  };

  /**
   * No-op clear operation.
   */
  public clear = async (): Promise<void> => {
    void 0;
  };
}

/**
 * Persistent notification adapter for live trading signals.
 *
 * Features:
 * - Persists notifications to disk using PersistNotificationAdapter
 * - Lazy initialization with singleshot pattern
 * - Maintains up to MAX_NOTIFICATIONS (250) most recent notifications
 * - Filters out error notifications when persisting to disk
 * - Handles all notification types: signals, partial profit/loss, breakeven, risk, errors
 *
 * Use this adapter (default) for live notification persistence across sessions.
 */
export class NotificationPersistLiveUtils implements INotificationUtils {
  /** Map of notification IDs to notification models */
  private _notifications: Map<string, NotificationModel>;

  /**
   * Singleshot initialization function that loads notifications from disk.
   * Protected by singleshot to ensure one-time execution.
   */
  private waitForInit = singleshot(async () => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_WAIT_FOR_INIT);
    const notificationList = await PersistNotificationAdapter.readNotificationData(false);
    notificationList.sort((a, b) => {
      const aTime = 'createdAt' in a ? a.createdAt : 0;
      const bTime = 'createdAt' in b ? b.createdAt : 0;
      return aTime - bTime;
    });
    this._notifications = new Map(
      notificationList
        .slice(-MAX_NOTIFICATIONS)
        .map((notification) => [notification.id, notification]),
    );
  });

  /**
   * Persists the current notification map to disk storage.
   * Filters out error notifications and sorts by createdAt.
   * Keeps only the most recent MAX_NOTIFICATIONS.
   * @throws Error if not initialized
   */
  private async _updateNotifications(): Promise<void> {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_UPDATE_NOTIFICATIONS);
    if (!this._notifications) {
      throw new Error(
        "NotificationPersistLiveUtils not initialized. Call waitForInit first.",
      );
    }
    const notificationList = Array.from(this._notifications.values())
      .filter(({ type }) => !type.startsWith("error."));
    notificationList.sort((a, b) => {
      const aTime = 'createdAt' in a ? a.createdAt : 0;
      const bTime = 'createdAt' in b ? b.createdAt : 0;
      return aTime - bTime;
    });
    await PersistNotificationAdapter.writeNotificationData(
      notificationList.slice(-MAX_NOTIFICATIONS),
      false,
    );
  }

  /**
   * Adds a notification to the map.
   * Removes oldest notification if limit is exceeded.
   * @param notification - The notification model to add
   */
  private _addNotification(notification: NotificationModel): void {
    this._notifications.set(notification.id, notification);
    if (this._notifications.size > MAX_NOTIFICATIONS) {
      const firstKey = this._notifications.keys().next().value;
      if (firstKey) {
        this._notifications.delete(firstKey);
      }
    }
  }

  /**
   * Handles signal events.
   * Creates and stores notification for opened, closed, scheduled, cancelled signals.
   * @param data - The strategy tick result data
   */
  public handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_SIGNAL, {
      signalId: data.signal?.id,
      action: data.action,
    });
    await this.waitForInit();
    const notification = CREATE_SIGNAL_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
      await this._updateNotifications();
    }
  };

  /**
   * Handles partial profit availability event.
   * @param data - The partial profit contract data
   */
  public handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_PARTIAL_PROFIT, {
      signalId: data.data.id,
      level: data.level,
    });
    await this.waitForInit();
    this._addNotification(CREATE_PARTIAL_PROFIT_NOTIFICATION_FN(data));
    await this._updateNotifications();
  };

  /**
   * Handles partial loss availability event.
   * @param data - The partial loss contract data
   */
  public handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_PARTIAL_LOSS, {
      signalId: data.data.id,
      level: data.level,
    });
    await this.waitForInit();
    this._addNotification(CREATE_PARTIAL_LOSS_NOTIFICATION_FN(data));
    await this._updateNotifications();
  };

  /**
   * Handles breakeven availability event.
   * @param data - The breakeven contract data
   */
  public handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_BREAKEVEN, {
      signalId: data.data.id,
    });
    await this.waitForInit();
    this._addNotification(CREATE_BREAKEVEN_NOTIFICATION_FN(data));
    await this._updateNotifications();
  };

  /**
   * Handles strategy commit events.
   * @param data - The strategy commit contract data
   */
  public handleStrategyCommit = async (data: StrategyCommitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_STRATEGY_COMMIT, {
      signalId: data.signalId,
      action: data.action,
    });
    await this.waitForInit();
    const notification = CREATE_STRATEGY_COMMIT_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
      await this._updateNotifications();
    }
  };

  /**
   * Handles risk rejection event.
   * @param data - The risk contract data
   */
  public handleRisk = async (data: RiskContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_RISK, {
      signalId: data.currentSignal.id,
      rejectionId: data.rejectionId,
    });
    await this.waitForInit();
    this._addNotification(CREATE_RISK_NOTIFICATION_FN(data));
    await this._updateNotifications();
  };

  /**
   * Handles error event.
   * Note: Error notifications are not persisted to disk.
   * @param error - The error object
   */
  public handleError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_ERROR, {
      message: getErrorMessage(error),
    });
    await this.waitForInit();
    this._addNotification(CREATE_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Handles critical error event.
   * Note: Error notifications are not persisted to disk.
   * @param error - The error object
   */
  public handleCriticalError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_CRITICAL_ERROR, {
      message: getErrorMessage(error),
    });
    await this.waitForInit();
    this._addNotification(CREATE_CRITICAL_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Handles validation error event.
   * Note: Error notifications are not persisted to disk.
   * @param error - The error object
   */
  public handleValidationError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_HANDLE_VALIDATION_ERROR, {
      message: getErrorMessage(error),
    });
    await this.waitForInit();
    this._addNotification(CREATE_VALIDATION_ERROR_NOTIFICATION_FN(error));
  };

  /**
   * Gets all stored notifications.
   * @returns Array of all notification models
   */
  public getData = async (): Promise<NotificationModel[]> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_GET_DATA);
    await this.waitForInit();
    return Array.from(this._notifications.values());
  };

  /**
   * Clears all stored notifications.
   */
  public clear = async (): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_PERSIST_LIVE_METHOD_NAME_CLEAR);
    await this.waitForInit();
    this._notifications.clear();
    await this._updateNotifications();
  };
}

/**
 * Backtest notification adapter with pluggable notification backend.
 *
 * Features:
 * - Adapter pattern for swappable notification implementations
 * - Default adapter: NotificationMemoryBacktestUtils (in-memory storage)
 * - Alternative adapters: NotificationPersistBacktestUtils, NotificationDummyBacktestUtils
 * - Convenience methods: usePersist(), useMemory(), useDummy()
 */
export class NotificationBacktestAdapter implements INotificationUtils {
  /** Internal notification utils instance */
  private _notificationBacktestUtils: INotificationUtils = new NotificationMemoryBacktestUtils();

  /**
   * Handles signal events.
   * Proxies call to the underlying notification adapter.
   * @param data - The strategy tick result data
   */
  handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    return await this._notificationBacktestUtils.handleSignal(data);
  };

  /**
   * Handles partial profit availability event.
   * Proxies call to the underlying notification adapter.
   * @param data - The partial profit contract data
   */
  handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    return await this._notificationBacktestUtils.handlePartialProfit(data);
  };

  /**
   * Handles partial loss availability event.
   * Proxies call to the underlying notification adapter.
   * @param data - The partial loss contract data
   */
  handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    return await this._notificationBacktestUtils.handlePartialLoss(data);
  };

  /**
   * Handles breakeven availability event.
   * Proxies call to the underlying notification adapter.
   * @param data - The breakeven contract data
   */
  handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    return await this._notificationBacktestUtils.handleBreakeven(data);
  };

  /**
   * Handles strategy commit events.
   * Proxies call to the underlying notification adapter.
   * @param data - The strategy commit contract data
   */
  handleStrategyCommit = async (data: StrategyCommitContract): Promise<void> => {
    return await this._notificationBacktestUtils.handleStrategyCommit(data);
  };

  /**
   * Handles risk rejection event.
   * Proxies call to the underlying notification adapter.
   * @param data - The risk contract data
   */
  handleRisk = async (data: RiskContract): Promise<void> => {
    return await this._notificationBacktestUtils.handleRisk(data);
  };

  /**
   * Handles error event.
   * Proxies call to the underlying notification adapter.
   * @param error - The error object
   */
  handleError = async (error: Error): Promise<void> => {
    return await this._notificationBacktestUtils.handleError(error);
  };

  /**
   * Handles critical error event.
   * Proxies call to the underlying notification adapter.
   * @param error - The error object
   */
  handleCriticalError = async (error: Error): Promise<void> => {
    return await this._notificationBacktestUtils.handleCriticalError(error);
  };

  /**
   * Handles validation error event.
   * Proxies call to the underlying notification adapter.
   * @param error - The error object
   */
  handleValidationError = async (error: Error): Promise<void> => {
    return await this._notificationBacktestUtils.handleValidationError(error);
  };

  /**
   * Gets all stored notifications.
   * Proxies call to the underlying notification adapter.
   * @returns Array of all notification models
   */
  getData = async (): Promise<NotificationModel[]> => {
    return await this._notificationBacktestUtils.getData();
  };

  /**
   * Clears all stored notifications.
   * Proxies call to the underlying notification adapter.
   */
  clear = async (): Promise<void> => {
    return await this._notificationBacktestUtils.clear();
  };

  /**
   * Sets the notification adapter constructor.
   * All future notification operations will use this adapter.
   *
   * @param Ctor - Constructor for notification adapter
   */
  useNotificationAdapter = (Ctor: TNotificationUtilsCtor): void => {
    backtest.loggerService.info(NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._notificationBacktestUtils = Reflect.construct(Ctor, []);
  };

  /**
   * Switches to dummy notification adapter.
   * All future notification writes will be no-ops.
   */
  useDummy = (): void => {
    backtest.loggerService.info(NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._notificationBacktestUtils = new NotificationDummyBacktestUtils();
  };

  /**
   * Switches to in-memory notification adapter (default).
   * Notifications will be stored in memory only.
   */
  useMemory = (): void => {
    backtest.loggerService.info(NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._notificationBacktestUtils = new NotificationMemoryBacktestUtils();
  };

  /**
   * Switches to persistent notification adapter.
   * Notifications will be persisted to disk.
   */
  usePersist = (): void => {
    backtest.loggerService.info(NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this._notificationBacktestUtils = new NotificationPersistBacktestUtils();
  };
}

/**
 * Live trading notification adapter with pluggable notification backend.
 *
 * Features:
 * - Adapter pattern for swappable notification implementations
 * - Default adapter: NotificationMemoryLiveUtils (in-memory storage)
 * - Alternative adapters: NotificationPersistLiveUtils, NotificationDummyLiveUtils
 * - Convenience methods: usePersist(), useMemory(), useDummy()
 */
export class NotificationLiveAdapter implements INotificationUtils {
  /** Internal notification utils instance */
  private _notificationLiveUtils: INotificationUtils = new NotificationMemoryLiveUtils();

  /**
   * Handles signal events.
   * Proxies call to the underlying notification adapter.
   * @param data - The strategy tick result data
   */
  handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    return await this._notificationLiveUtils.handleSignal(data);
  };

  /**
   * Handles partial profit availability event.
   * Proxies call to the underlying notification adapter.
   * @param data - The partial profit contract data
   */
  handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    return await this._notificationLiveUtils.handlePartialProfit(data);
  };

  /**
   * Handles partial loss availability event.
   * Proxies call to the underlying notification adapter.
   * @param data - The partial loss contract data
   */
  handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    return await this._notificationLiveUtils.handlePartialLoss(data);
  };

  /**
   * Handles breakeven availability event.
   * Proxies call to the underlying notification adapter.
   * @param data - The breakeven contract data
   */
  handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    return await this._notificationLiveUtils.handleBreakeven(data);
  };

  /**
   * Handles strategy commit events.
   * Proxies call to the underlying notification adapter.
   * @param data - The strategy commit contract data
   */
  handleStrategyCommit = async (data: StrategyCommitContract): Promise<void> => {
    return await this._notificationLiveUtils.handleStrategyCommit(data);
  };

  /**
   * Handles risk rejection event.
   * Proxies call to the underlying notification adapter.
   * @param data - The risk contract data
   */
  handleRisk = async (data: RiskContract): Promise<void> => {
    return await this._notificationLiveUtils.handleRisk(data);
  };

  /**
   * Handles error event.
   * Proxies call to the underlying notification adapter.
   * @param error - The error object
   */
  handleError = async (error: Error): Promise<void> => {
    return await this._notificationLiveUtils.handleError(error);
  };

  /**
   * Handles critical error event.
   * Proxies call to the underlying notification adapter.
   * @param error - The error object
   */
  handleCriticalError = async (error: Error): Promise<void> => {
    return await this._notificationLiveUtils.handleCriticalError(error);
  };

  /**
   * Handles validation error event.
   * Proxies call to the underlying notification adapter.
   * @param error - The error object
   */
  handleValidationError = async (error: Error): Promise<void> => {
    return await this._notificationLiveUtils.handleValidationError(error);
  };

  /**
   * Gets all stored notifications.
   * Proxies call to the underlying notification adapter.
   * @returns Array of all notification models
   */
  getData = async (): Promise<NotificationModel[]> => {
    return await this._notificationLiveUtils.getData();
  };

  /**
   * Clears all stored notifications.
   * Proxies call to the underlying notification adapter.
   */
  clear = async (): Promise<void> => {
    return await this._notificationLiveUtils.clear();
  };

  /**
   * Sets the notification adapter constructor.
   * All future notification operations will use this adapter.
   *
   * @param Ctor - Constructor for notification adapter
   */
  useNotificationAdapter = (Ctor: TNotificationUtilsCtor): void => {
    backtest.loggerService.info(NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._notificationLiveUtils = Reflect.construct(Ctor, []);
  };

  /**
   * Switches to dummy notification adapter.
   * All future notification writes will be no-ops.
   */
  useDummy = (): void => {
    backtest.loggerService.info(NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._notificationLiveUtils = new NotificationDummyLiveUtils();
  };

  /**
   * Switches to in-memory notification adapter (default).
   * Notifications will be stored in memory only.
   */
  useMemory = (): void => {
    backtest.loggerService.info(NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._notificationLiveUtils = new NotificationMemoryLiveUtils();
  };

  /**
   * Switches to persistent notification adapter.
   * Notifications will be persisted to disk.
   */
  usePersist = (): void => {
    backtest.loggerService.info(NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this._notificationLiveUtils = new NotificationPersistLiveUtils();
  };
}

/**
 * Main notification adapter that manages both backtest and live notification storage.
 *
 * Features:
 * - Subscribes to signal emitters for automatic notification updates
 * - Provides unified access to both backtest and live notifications
 * - Singleshot enable pattern prevents duplicate subscriptions
 * - Cleanup function for proper unsubscription
 */
export class NotificationAdapter {
  /**
   * Enables notification storage by subscribing to signal emitters.
   * Uses singleshot to ensure one-time subscription.
   *
   * @returns Cleanup function that unsubscribes from all emitters
   */
  public enable = singleshot(() => {
    backtest.loggerService.info(NOTIFICATION_ADAPTER_METHOD_NAME_ENABLE);
    let unLive: Function;
    let unBacktest: Function;

    {
      const unBacktestSignal = signalBacktestEmitter.subscribe((data: IStrategyTickResult) =>
        NotificationBacktest.handleSignal(data),
      );

      const unBacktestPartialProfit = partialProfitSubject
        .filter(({ backtest }) => backtest)
        .connect((data: PartialProfitContract) =>
          NotificationBacktest.handlePartialProfit(data),
        );

      const unBacktestPartialLoss = partialLossSubject
        .filter(({ backtest }) => backtest)
        .connect((data: PartialLossContract) =>
          NotificationBacktest.handlePartialLoss(data),
        );

      const unBacktestBreakeven = breakevenSubject
        .filter(({ backtest }) => backtest)
        .connect((data: BreakevenContract) =>
          NotificationBacktest.handleBreakeven(data),
        );

      const unBacktestStrategyCommit = strategyCommitSubject
        .filter(({ backtest }) => backtest)
        .connect((data: StrategyCommitContract) =>
          NotificationBacktest.handleStrategyCommit(data),
        );

      const unBacktestRisk = riskSubject
        .filter(({ backtest }) => backtest)
        .connect((data: RiskContract) =>
          NotificationBacktest.handleRisk(data),
        );

      const unBacktestError = errorEmitter.subscribe((error: Error) =>
        NotificationBacktest.handleError(error),
      );

      const unBacktestExit = exitEmitter.subscribe((error: Error) =>
        NotificationBacktest.handleCriticalError(error),
      );

      const unBacktestValidation = validationSubject.subscribe((error: Error) =>
        NotificationBacktest.handleValidationError(error),
      );

      unBacktest = compose(
        () => unBacktestSignal(),
        () => unBacktestPartialProfit(),
        () => unBacktestPartialLoss(),
        () => unBacktestBreakeven(),
        () => unBacktestStrategyCommit(),
        () => unBacktestRisk(),
        () => unBacktestError(),
        () => unBacktestExit(),
        () => unBacktestValidation(),
      );
    }

    {
      const unLiveSignal = signalLiveEmitter.subscribe((data: IStrategyTickResult) =>
        NotificationLive.handleSignal(data),
      );

      const unLivePartialProfit = partialProfitSubject
        .filter(({ backtest }) => !backtest)
        .connect((data: PartialProfitContract) =>
          NotificationLive.handlePartialProfit(data),
        );

      const unLivePartialLoss = partialLossSubject
        .filter(({ backtest }) => !backtest)
        .connect((data: PartialLossContract) =>
          NotificationLive.handlePartialLoss(data),
        );

      const unLiveBreakeven = breakevenSubject
        .filter(({ backtest }) => !backtest)
        .connect((data: BreakevenContract) =>
          NotificationLive.handleBreakeven(data),
        );

      const unLiveStrategyCommit = strategyCommitSubject
        .filter(({ backtest }) => !backtest)
        .connect((data: StrategyCommitContract) =>
          NotificationLive.handleStrategyCommit(data),
        );

      const unLiveRisk = riskSubject
        .filter(({ backtest }) => !backtest)
        .connect((data: RiskContract) =>
          NotificationLive.handleRisk(data),
        );

      const unLiveError = errorEmitter.subscribe((error: Error) =>
        NotificationLive.handleError(error),
      );

      const unLiveExit = exitEmitter.subscribe((error: Error) =>
        NotificationLive.handleCriticalError(error),
      );

      const unLiveValidation = validationSubject.subscribe((error: Error) =>
        NotificationLive.handleValidationError(error),
      );

      unLive = compose(
        () => unLiveSignal(),
        () => unLivePartialProfit(),
        () => unLivePartialLoss(),
        () => unLiveBreakeven(),
        () => unLiveStrategyCommit(),
        () => unLiveRisk(),
        () => unLiveError(),
        () => unLiveExit(),
        () => unLiveValidation(),
      );
    }

    return () => {
      unLive();
      unBacktest();
      this.enable.clear();
    };
  });

  /**
   * Disables notification storage by unsubscribing from all emitters.
   * Safe to call multiple times.
   */
  public disable = () => {
    backtest.loggerService.info(NOTIFICATION_ADAPTER_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  /**
   * Gets all backtest/live notifications from storage.
   *
   * @returns Array of all backtest notification models
   * @throws Error if NotificationAdapter is not enabled
   */
  public getData = async (isBacktest: boolean): Promise<NotificationModel[]> => {
    backtest.loggerService.info(NOTIFICATION_ADAPTER_METHOD_NAME_GET_DATA_BACKTEST, {
      backtest: isBacktest,
    });
    if (!this.enable.hasValue()) {
      throw new Error("NotificationAdapter is not enabled. Call enable() first.");
    }
    if (isBacktest) {
      return await NotificationBacktest.getData();
    }
    return await NotificationLive.getData();
  };

  /**
   * Clears all backtest/live notifications from storage.
   *
   * @throws Error if NotificationAdapter is not enabled
   */
  public clear = async (isBacktest: boolean): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_ADAPTER_METHOD_NAME_CLEAR_LIVE, {
      backtest: isBacktest,
    });
    if (!this.enable.hasValue()) {
      throw new Error("NotificationAdapter is not enabled. Call enable() first.");
    }
    if (isBacktest) {
      return await NotificationBacktest.clear();
    }
    return await NotificationLive.clear();
  };
}

/**
 * Global singleton instance of NotificationAdapter.
 * Provides unified notification management for backtest and live trading.
 */
export const Notification = new NotificationAdapter();

/**
 * Global singleton instance of NotificationLiveAdapter.
 * Provides live trading notification storage with pluggable backends.
 */
export const NotificationLive = new NotificationLiveAdapter();

/**
 * Global singleton instance of NotificationBacktestAdapter.
 * Provides backtest notification storage with pluggable backends.
 */
export const NotificationBacktest = new NotificationBacktestAdapter();
