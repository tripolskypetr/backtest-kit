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

const MAX_NOTIFICATIONS = 250;

const CREATE_KEY_FN = () => randomString();

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
  } else if (data.action === "closed") {
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
  } else if (data.action === "scheduled") {
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
  } else if (data.action === "cancelled") {
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
  } else if (data.action === "partial-loss") {
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
  } else if (data.action === "breakeven") {
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
  } else if (data.action === "trailing-stop") {
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
  } else if (data.action === "trailing-take") {
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
  } else if (data.action === "activate-scheduled") {
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

const CREATE_ERROR_NOTIFICATION_FN = (error: Error): NotificationModel => ({
  type: "error.info",
  id: CREATE_KEY_FN(),
  error: errorData(error),
  message: getErrorMessage(error),
  backtest: false,
});

const CREATE_CRITICAL_ERROR_NOTIFICATION_FN = (error: Error): NotificationModel => ({
  type: "error.critical",
  id: CREATE_KEY_FN(),
  error: errorData(error),
  message: getErrorMessage(error),
  backtest: false,
});

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

const NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER = "NotificationLiveAdapter.useNotificationAdapter";
const NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY = "NotificationLiveAdapter.useDummy";
const NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_MEMORY = "NotificationLiveAdapter.useMemory";

export interface INotificationUtils {
  handleSignal(data: IStrategyTickResult): Promise<void>;
  handlePartialProfit(data: PartialProfitContract): Promise<void>;
  handlePartialLoss(data: PartialLossContract): Promise<void>;
  handleBreakeven(data: BreakevenContract): Promise<void>;
  handleStrategyCommit(data: StrategyCommitContract): Promise<void>;
  handleRisk(data: RiskContract): Promise<void>;
  getData(): Promise<NotificationModel[]>;
  clear(): Promise<void>;
}

export interface INotificationLiveUtils extends INotificationUtils {
  handleError(error: Error): Promise<void>;
  handleCriticalError(error: Error): Promise<void>;
  handleValidationError(error: Error): Promise<void>;
}

export type TNotificationUtilsCtor = new () => INotificationUtils;
export type TNotificationLiveUtilsCtor = new () => INotificationLiveUtils;

export class NotificationMemoryBacktestUtils implements INotificationUtils {
  private _notifications: NotificationModel[] = [];

  private _addNotification(notification: NotificationModel): void {
    this._notifications.unshift(notification);
    if (this._notifications.length > MAX_NOTIFICATIONS) {
      this._notifications.pop();
    }
  }

  public handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_SIGNAL, {
      signalId: data.signal.id,
      action: data.action,
    });
    const notification = CREATE_SIGNAL_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
    }
  };

  public handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_PROFIT, {
      signalId: data.data.id,
      level: data.level,
    });
    this._addNotification(CREATE_PARTIAL_PROFIT_NOTIFICATION_FN(data));
  };

  public handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_PARTIAL_LOSS, {
      signalId: data.data.id,
      level: data.level,
    });
    this._addNotification(CREATE_PARTIAL_LOSS_NOTIFICATION_FN(data));
  };

  public handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_BREAKEVEN, {
      signalId: data.data.id,
    });
    this._addNotification(CREATE_BREAKEVEN_NOTIFICATION_FN(data));
  };

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

  public handleRisk = async (data: RiskContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_HANDLE_RISK, {
      signalId: data.currentSignal.id,
      rejectionId: data.rejectionId,
    });
    this._addNotification(CREATE_RISK_NOTIFICATION_FN(data));
  };

  public getData = async (): Promise<NotificationModel[]> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_GET_DATA);
    return [...this._notifications];
  };

  public clear = async (): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_BACKTEST_METHOD_NAME_CLEAR);
    this._notifications = [];
  };
}

export class NotificationDummyBacktestUtils implements INotificationUtils {
  public handleSignal = async (): Promise<void> => {
    void 0;
  };

  public handlePartialProfit = async (): Promise<void> => {
    void 0;
  };

  public handlePartialLoss = async (): Promise<void> => {
    void 0;
  };

  public handleBreakeven = async (): Promise<void> => {
    void 0;
  };

  public handleStrategyCommit = async (): Promise<void> => {
    void 0;
  };

  public handleRisk = async (): Promise<void> => {
    void 0;
  };

  public getData = async (): Promise<NotificationModel[]> => {
    return [];
  };

  public clear = async (): Promise<void> => {
    void 0;
  };
}

export class NotificationMemoryLiveUtils implements INotificationLiveUtils {
  private _notifications: NotificationModel[] = [];

  private _addNotification(notification: NotificationModel): void {
    this._notifications.unshift(notification);
    if (this._notifications.length > MAX_NOTIFICATIONS) {
      this._notifications.pop();
    }
  }

  public handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_SIGNAL, {
      signalId: data.signal.id,
      action: data.action,
    });
    const notification = CREATE_SIGNAL_NOTIFICATION_FN(data);
    if (notification) {
      this._addNotification(notification);
    }
  };

  public handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_PARTIAL_PROFIT, {
      signalId: data.data.id,
      level: data.level,
    });
    this._addNotification(CREATE_PARTIAL_PROFIT_NOTIFICATION_FN(data));
  };

  public handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_PARTIAL_LOSS, {
      signalId: data.data.id,
      level: data.level,
    });
    this._addNotification(CREATE_PARTIAL_LOSS_NOTIFICATION_FN(data));
  };

  public handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_BREAKEVEN, {
      signalId: data.data.id,
    });
    this._addNotification(CREATE_BREAKEVEN_NOTIFICATION_FN(data));
  };

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

  public handleRisk = async (data: RiskContract): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_RISK, {
      signalId: data.currentSignal.id,
      rejectionId: data.rejectionId,
    });
    this._addNotification(CREATE_RISK_NOTIFICATION_FN(data));
  };

  public handleError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_ERROR, {
      message: getErrorMessage(error),
    });
    this._addNotification(CREATE_ERROR_NOTIFICATION_FN(error));
  };

  public handleCriticalError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_CRITICAL_ERROR, {
      message: getErrorMessage(error),
    });
    this._addNotification(CREATE_CRITICAL_ERROR_NOTIFICATION_FN(error));
  };

  public handleValidationError = async (error: Error): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_HANDLE_VALIDATION_ERROR, {
      message: getErrorMessage(error),
    });
    this._addNotification(CREATE_VALIDATION_ERROR_NOTIFICATION_FN(error));
  };

  public getData = async (): Promise<NotificationModel[]> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_GET_DATA);
    return [...this._notifications];
  };

  public clear = async (): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_MEMORY_LIVE_METHOD_NAME_CLEAR);
    this._notifications = [];
  };
}

export class NotificationDummyLiveUtils implements INotificationLiveUtils {
  public handleSignal = async (): Promise<void> => {
    void 0;
  };

  public handlePartialProfit = async (): Promise<void> => {
    void 0;
  };

  public handlePartialLoss = async (): Promise<void> => {
    void 0;
  };

  public handleBreakeven = async (): Promise<void> => {
    void 0;
  };

  public handleStrategyCommit = async (): Promise<void> => {
    void 0;
  };

  public handleRisk = async (): Promise<void> => {
    void 0;
  };

  public handleError = async (): Promise<void> => {
    void 0;
  };

  public handleCriticalError = async (): Promise<void> => {
    void 0;
  };

  public handleValidationError = async (): Promise<void> => {
    void 0;
  };

  public getData = async (): Promise<NotificationModel[]> => {
    return [];
  };

  public clear = async (): Promise<void> => {
    void 0;
  };
}

export class NotificationBacktestAdapter implements INotificationUtils {
  private _notificationBacktestUtils: INotificationUtils = new NotificationMemoryBacktestUtils();

  handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    return await this._notificationBacktestUtils.handleSignal(data);
  };

  handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    return await this._notificationBacktestUtils.handlePartialProfit(data);
  };

  handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    return await this._notificationBacktestUtils.handlePartialLoss(data);
  };

  handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    return await this._notificationBacktestUtils.handleBreakeven(data);
  };

  handleStrategyCommit = async (data: StrategyCommitContract): Promise<void> => {
    return await this._notificationBacktestUtils.handleStrategyCommit(data);
  };

  handleRisk = async (data: RiskContract): Promise<void> => {
    return await this._notificationBacktestUtils.handleRisk(data);
  };

  getData = async (): Promise<NotificationModel[]> => {
    return await this._notificationBacktestUtils.getData();
  };

  clear = async (): Promise<void> => {
    return await this._notificationBacktestUtils.clear();
  };

  useNotificationAdapter = (Ctor: TNotificationUtilsCtor): void => {
    backtest.loggerService.info(NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._notificationBacktestUtils = Reflect.construct(Ctor, []);
  };

  useDummy = (): void => {
    backtest.loggerService.info(NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._notificationBacktestUtils = new NotificationDummyBacktestUtils();
  };

  useMemory = (): void => {
    backtest.loggerService.info(NOTIFICATION_BACKTEST_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._notificationBacktestUtils = new NotificationMemoryBacktestUtils();
  };
}

export class NotificationLiveAdapter implements INotificationLiveUtils {
  private _notificationLiveUtils: INotificationLiveUtils = new NotificationMemoryLiveUtils();

  handleSignal = async (data: IStrategyTickResult): Promise<void> => {
    return await this._notificationLiveUtils.handleSignal(data);
  };

  handlePartialProfit = async (data: PartialProfitContract): Promise<void> => {
    return await this._notificationLiveUtils.handlePartialProfit(data);
  };

  handlePartialLoss = async (data: PartialLossContract): Promise<void> => {
    return await this._notificationLiveUtils.handlePartialLoss(data);
  };

  handleBreakeven = async (data: BreakevenContract): Promise<void> => {
    return await this._notificationLiveUtils.handleBreakeven(data);
  };

  handleStrategyCommit = async (data: StrategyCommitContract): Promise<void> => {
    return await this._notificationLiveUtils.handleStrategyCommit(data);
  };

  handleRisk = async (data: RiskContract): Promise<void> => {
    return await this._notificationLiveUtils.handleRisk(data);
  };

  handleError = async (error: Error): Promise<void> => {
    return await this._notificationLiveUtils.handleError(error);
  };

  handleCriticalError = async (error: Error): Promise<void> => {
    return await this._notificationLiveUtils.handleCriticalError(error);
  };

  handleValidationError = async (error: Error): Promise<void> => {
    return await this._notificationLiveUtils.handleValidationError(error);
  };

  getData = async (): Promise<NotificationModel[]> => {
    return await this._notificationLiveUtils.getData();
  };

  clear = async (): Promise<void> => {
    return await this._notificationLiveUtils.clear();
  };

  useNotificationAdapter = (Ctor: TNotificationLiveUtilsCtor): void => {
    backtest.loggerService.info(NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._notificationLiveUtils = Reflect.construct(Ctor, []);
  };

  useDummy = (): void => {
    backtest.loggerService.info(NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._notificationLiveUtils = new NotificationDummyLiveUtils();
  };

  useMemory = (): void => {
    backtest.loggerService.info(NOTIFICATION_LIVE_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._notificationLiveUtils = new NotificationMemoryLiveUtils();
  };
}

export class NotificationAdapter {
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

      unBacktest = compose(
        () => unBacktestSignal(),
        () => unBacktestPartialProfit(),
        () => unBacktestPartialLoss(),
        () => unBacktestBreakeven(),
        () => unBacktestStrategyCommit(),
        () => unBacktestRisk(),
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

  public disable = () => {
    backtest.loggerService.info(NOTIFICATION_ADAPTER_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  public getDataBacktest = async (): Promise<NotificationModel[]> => {
    backtest.loggerService.info(NOTIFICATION_ADAPTER_METHOD_NAME_GET_DATA_BACKTEST);
    if (!this.enable.hasValue()) {
      throw new Error("NotificationAdapter is not enabled. Call enable() first.");
    }
    return await NotificationBacktest.getData();
  };

  public getDataLive = async (): Promise<NotificationModel[]> => {
    backtest.loggerService.info(NOTIFICATION_ADAPTER_METHOD_NAME_GET_DATA_LIVE);
    if (!this.enable.hasValue()) {
      throw new Error("NotificationAdapter is not enabled. Call enable() first.");
    }
    return await NotificationLive.getData();
  };

  public clearBacktest = async (): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_ADAPTER_METHOD_NAME_CLEAR_BACKTEST);
    if (!this.enable.hasValue()) {
      throw new Error("NotificationAdapter is not enabled. Call enable() first.");
    }
    return await NotificationBacktest.clear();
  };

  public clearLive = async (): Promise<void> => {
    backtest.loggerService.info(NOTIFICATION_ADAPTER_METHOD_NAME_CLEAR_LIVE);
    if (!this.enable.hasValue()) {
      throw new Error("NotificationAdapter is not enabled. Call enable() first.");
    }
    return await NotificationLive.clear();
  };
}

export const Notification = new NotificationAdapter();
export const NotificationLive = new NotificationLiveAdapter();
export const NotificationBacktest = new NotificationBacktestAdapter();
