import {
  errorData,
  getErrorMessage,
  not,
  randomString,
  singleshot,
  trycatch,
} from "functools-kit";
import {
  IStrategy,
  ISignalRow,
  IScheduledSignalRow,
  IStrategyParams,
  IStrategyTickResult,
  IStrategyTickResultIdle,
  IStrategyTickResultScheduled,
  IStrategyTickResultOpened,
  IStrategyTickResultActive,
  IStrategyTickResultClosed,
  IStrategyTickResultCancelled,
  IStrategyBacktestResult,
  StrategyCloseReason,
  SignalInterval,
} from "../interfaces/Strategy.interface";
import toProfitLossDto from "../helpers/toProfitLossDto";
import { ICandleData } from "../interfaces/Exchange.interface";
import { PersistSignalAdaper } from "../classes/Persist";
import backtest from "../lib";
import { errorEmitter } from "../config/emitters";
import { CC_SCHEDULE_AWAIT_MINUTES } from "../config/params";

const INTERVAL_MINUTES: Record<SignalInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
};

const VALIDATE_SIGNAL_FN = (signal: ISignalRow): void => {
  const errors: string[] = [];

  // Валидация цен
  if (signal.priceOpen <= 0) {
    errors.push(`priceOpen must be positive, got ${signal.priceOpen}`);
  }
  if (signal.priceTakeProfit <= 0) {
    errors.push(
      `priceTakeProfit must be positive, got ${signal.priceTakeProfit}`
    );
  }
  if (signal.priceStopLoss <= 0) {
    errors.push(`priceStopLoss must be positive, got ${signal.priceStopLoss}`);
  }

  // Валидация для long позиции
  if (signal.position === "long") {
    if (signal.priceTakeProfit <= signal.priceOpen) {
      errors.push(
        `Long: priceTakeProfit (${signal.priceTakeProfit}) must be > priceOpen (${signal.priceOpen})`
      );
    }
    if (signal.priceStopLoss >= signal.priceOpen) {
      errors.push(
        `Long: priceStopLoss (${signal.priceStopLoss}) must be < priceOpen (${signal.priceOpen})`
      );
    }
  }

  // Валидация для short позиции
  if (signal.position === "short") {
    if (signal.priceTakeProfit >= signal.priceOpen) {
      errors.push(
        `Short: priceTakeProfit (${signal.priceTakeProfit}) must be < priceOpen (${signal.priceOpen})`
      );
    }
    if (signal.priceStopLoss <= signal.priceOpen) {
      errors.push(
        `Short: priceStopLoss (${signal.priceStopLoss}) must be > priceOpen (${signal.priceOpen})`
      );
    }
  }

  // Валидация временных параметров
  if (signal.minuteEstimatedTime <= 0) {
    errors.push(
      `minuteEstimatedTime must be positive, got ${signal.minuteEstimatedTime}`
    );
  }
  if (signal.timestamp <= 0) {
    errors.push(`timestamp must be positive, got ${signal.timestamp}`);
  }

  // Кидаем ошибку если есть проблемы
  if (errors.length > 0) {
    throw new Error(
      `Invalid signal for ${signal.position} position:\n${errors.join("\n")}`
    );
  }
};

const GET_SIGNAL_FN = trycatch(
  async (self: ClientStrategy): Promise<ISignalRow | IScheduledSignalRow | null> => {
    if (self._isStopped) {
      return null;
    }
    const currentTime = self.params.execution.context.when.getTime();
    {
      const intervalMinutes = INTERVAL_MINUTES[self.params.interval];
      const intervalMs = intervalMinutes * 60 * 1000;

      // Проверяем что прошел нужный интервал с последнего getSignal
      if (
        self._lastSignalTimestamp !== null &&
        currentTime - self._lastSignalTimestamp < intervalMs
      ) {
        return null;
      }

      self._lastSignalTimestamp = currentTime;
    }
    const signal = await self.params.getSignal(
      self.params.execution.context.symbol
    );
    if (!signal) {
      return null;
    }

    // Если priceOpen указан - создаем scheduled signal (risk check при активации)
    if (signal.priceOpen !== undefined) {
      const scheduledSignalRow: IScheduledSignalRow = {
        id: randomString(),
        priceOpen: signal.priceOpen,
        position: signal.position,
        note: signal.note,
        priceTakeProfit: signal.priceTakeProfit,
        priceStopLoss: signal.priceStopLoss,
        minuteEstimatedTime: signal.minuteEstimatedTime,
        symbol: self.params.execution.context.symbol,
        exchangeName: self.params.method.context.exchangeName,
        strategyName: self.params.method.context.strategyName,
        timestamp: currentTime,
      };

      // Валидируем сигнал перед возвратом
      VALIDATE_SIGNAL_FN(scheduledSignalRow);

      // @ts-ignore - runtime marker
      scheduledSignalRow._isScheduled = true;

      return scheduledSignalRow;
    }

    // Если priceOpen не указан - создаем обычный signal с текущей ценой
    const currentPrice = await self.params.exchange.getAveragePrice(
      self.params.execution.context.symbol
    );

    // Check risk before creating pending signal
    if (
      await not(
        self.params.risk.checkSignal({
          symbol: self.params.execution.context.symbol,
          strategyName: self.params.method.context.strategyName,
          exchangeName: self.params.method.context.exchangeName,
          currentPrice,
          timestamp: currentTime,
        })
      )
    ) {
      return null;
    }

    const signalRow: ISignalRow = {
      id: randomString(),
      priceOpen: currentPrice,
      ...signal,
      symbol: self.params.execution.context.symbol,
      exchangeName: self.params.method.context.exchangeName,
      strategyName: self.params.method.context.strategyName,
      timestamp: currentTime,
    };

    // Валидируем сигнал перед возвратом
    VALIDATE_SIGNAL_FN(signalRow);

    // @ts-ignore - runtime marker
    signalRow._isScheduled = false;

    return signalRow;
  },
  {
    defaultValue: null,
    fallback: (error) => {
      backtest.loggerService.warn("ClientStrategy exception thrown", {
        error: errorData(error),
        message: getErrorMessage(error),
      });
      errorEmitter.next(error);
    },
  }
);

const GET_AVG_PRICE_FN = (candles: ICandleData[]): number => {
  const sumPriceVolume = candles.reduce((acc, c) => {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    return acc + typicalPrice * c.volume;
  }, 0);

  const totalVolume = candles.reduce((acc, c) => acc + c.volume, 0);

  return totalVolume === 0
    ? candles.reduce((acc, c) => acc + c.close, 0) / candles.length
    : sumPriceVolume / totalVolume;
};

const WAIT_FOR_INIT_FN = async (self: ClientStrategy) => {
  self.params.logger.debug("ClientStrategy waitForInit");
  if (self.params.execution.context.backtest) {
    return;
  }
  const pendingSignal = await PersistSignalAdaper.readSignalData(
    self.params.strategyName,
    self.params.execution.context.symbol
  );
  if (!pendingSignal) {
    return;
  }
  if (pendingSignal.exchangeName !== self.params.method.context.exchangeName) {
    return;
  }
  if (pendingSignal.strategyName !== self.params.method.context.strategyName) {
    return;
  }
  self._pendingSignal = pendingSignal;

  // Call onActive callback for restored signal
  if (self.params.callbacks?.onActive) {
    const currentPrice = await self.params.exchange.getAveragePrice(
      self.params.execution.context.symbol
    );
    self.params.callbacks.onActive(
      self.params.execution.context.symbol,
      pendingSignal,
      currentPrice,
      self.params.execution.context.backtest
    );
  }
};

const CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  currentPrice: number
): Promise<IStrategyTickResultCancelled | null> => {
  const currentTime = self.params.execution.context.when.getTime();
  const signalTime = scheduled.timestamp;
  const maxTimeToWait = CC_SCHEDULE_AWAIT_MINUTES * 60 * 1000;
  const elapsedTime = currentTime - signalTime;

  if (elapsedTime < maxTimeToWait) {
    return null;
  }

  self.params.logger.info("ClientStrategy scheduled signal cancelled by timeout", {
    symbol: self.params.execution.context.symbol,
    signalId: scheduled.id,
    elapsedMinutes: Math.floor(elapsedTime / 60000),
    maxMinutes: CC_SCHEDULE_AWAIT_MINUTES,
  });

  self._scheduledSignal = null;

  if (self.params.callbacks?.onCancel) {
    self.params.callbacks.onCancel(
      self.params.execution.context.symbol,
      scheduled,
      currentPrice,
      self.params.execution.context.backtest
    );
  }

  const result: IStrategyTickResultCancelled = {
    action: "cancelled",
    signal: scheduled,
    currentPrice: currentPrice,
    closeTimestamp: currentTime,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN = (
  scheduled: IScheduledSignalRow,
  currentPrice: number
): { shouldActivate: boolean; shouldCancel: boolean } => {
  let shouldActivate = false;
  let shouldCancel = false;

  if (scheduled.position === "long") {
    if (currentPrice <= scheduled.priceOpen) {
      shouldActivate = true;
    }
    if (currentPrice <= scheduled.priceStopLoss) {
      shouldCancel = true;
    }
  }

  if (scheduled.position === "short") {
    if (currentPrice >= scheduled.priceOpen) {
      shouldActivate = true;
    }
    if (currentPrice >= scheduled.priceStopLoss) {
      shouldCancel = true;
    }
  }

  return { shouldActivate, shouldCancel };
};

const CANCEL_SCHEDULED_SIGNAL_BY_STOPLOSS_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  currentPrice: number
): Promise<IStrategyTickResultIdle> => {
  self.params.logger.info("ClientStrategy scheduled signal cancelled", {
    symbol: self.params.execution.context.symbol,
    signalId: scheduled.id,
    position: scheduled.position,
    averagePrice: currentPrice,
    priceStopLoss: scheduled.priceStopLoss,
  });

  self._scheduledSignal = null;

  const result: IStrategyTickResultIdle = {
    action: "idle",
    signal: null,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
    currentPrice: currentPrice,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const ACTIVATE_SCHEDULED_SIGNAL_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow
): Promise<IStrategyTickResultOpened> => {
  self.params.logger.info("ClientStrategy scheduled signal activated", {
    symbol: self.params.execution.context.symbol,
    signalId: scheduled.id,
    position: scheduled.position,
    averagePrice: scheduled.priceOpen,
    priceOpen: scheduled.priceOpen,
  });

  self._scheduledSignal = null;
  await self.setPendingSignal(scheduled);

  await self.params.risk.addSignal(self.params.execution.context.symbol, {
    strategyName: self.params.method.context.strategyName,
    riskName: self.params.riskName,
  });

  if (self.params.callbacks?.onOpen) {
    self.params.callbacks.onOpen(
      self.params.execution.context.symbol,
      self._pendingSignal,
      self._pendingSignal.priceOpen,
      self.params.execution.context.backtest
    );
  }

  const result: IStrategyTickResultOpened = {
    action: "opened",
    signal: self._pendingSignal,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
    currentPrice: self._pendingSignal.priceOpen,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const RETURN_SCHEDULED_SIGNAL_ACTIVE_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  currentPrice: number
): Promise<IStrategyTickResultActive> => {
  const result: IStrategyTickResultActive = {
    action: "active",
    signal: scheduled,
    currentPrice: currentPrice,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const OPEN_NEW_SCHEDULED_SIGNAL_FN = async (
  self: ClientStrategy,
  signal: IScheduledSignalRow
): Promise<IStrategyTickResultScheduled> => {
  const currentPrice = await self.params.exchange.getAveragePrice(
    self.params.execution.context.symbol
  );

  self.params.logger.info("ClientStrategy scheduled signal created", {
    symbol: self.params.execution.context.symbol,
    signalId: signal.id,
    position: signal.position,
    priceOpen: signal.priceOpen,
    currentPrice: currentPrice,
  });

  if (self.params.callbacks?.onSchedule) {
    self.params.callbacks.onSchedule(
      self.params.execution.context.symbol,
      signal,
      currentPrice,
      self.params.execution.context.backtest
    );
  }

  const result: IStrategyTickResultScheduled = {
    action: "scheduled",
    signal: signal,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
    currentPrice: currentPrice,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const OPEN_NEW_PENDING_SIGNAL_FN = async (
  self: ClientStrategy,
  signal: ISignalRow
): Promise<IStrategyTickResultOpened> => {
  await self.params.risk.addSignal(self.params.execution.context.symbol, {
    strategyName: self.params.method.context.strategyName,
    riskName: self.params.riskName,
  });

  if (self.params.callbacks?.onOpen) {
    self.params.callbacks.onOpen(
      self.params.execution.context.symbol,
      signal,
      signal.priceOpen,
      self.params.execution.context.backtest
    );
  }

  const result: IStrategyTickResultOpened = {
    action: "opened",
    signal: signal,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
    currentPrice: signal.priceOpen,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const CHECK_PENDING_SIGNAL_COMPLETION_FN = async (
  self: ClientStrategy,
  signal: ISignalRow,
  averagePrice: number
): Promise<IStrategyTickResultClosed | null> => {
  const currentTime = self.params.execution.context.when.getTime();
  const signalTime = signal.timestamp;
  const maxTimeToWait = signal.minuteEstimatedTime * 60 * 1000;
  const elapsedTime = currentTime - signalTime;

  // Check time expiration
  if (elapsedTime >= maxTimeToWait) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      averagePrice,
      "time_expired"
    );
  }

  // Check take profit
  if (signal.position === "long" && averagePrice >= signal.priceTakeProfit) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      averagePrice,
      "take_profit"
    );
  }

  if (signal.position === "short" && averagePrice <= signal.priceTakeProfit) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      averagePrice,
      "take_profit"
    );
  }

  // Check stop loss
  if (signal.position === "long" && averagePrice <= signal.priceStopLoss) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      averagePrice,
      "stop_loss"
    );
  }

  if (signal.position === "short" && averagePrice >= signal.priceStopLoss) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      averagePrice,
      "stop_loss"
    );
  }

  return null;
};

const CLOSE_PENDING_SIGNAL_FN = async (
  self: ClientStrategy,
  signal: ISignalRow,
  currentPrice: number,
  closeReason: "time_expired" | "take_profit" | "stop_loss"
): Promise<IStrategyTickResultClosed> => {
  const pnl = toProfitLossDto(signal, currentPrice);

  self.params.logger.info(`ClientStrategy signal ${closeReason}`, {
    symbol: self.params.execution.context.symbol,
    signalId: signal.id,
    closeReason,
    priceClose: currentPrice,
    pnlPercentage: pnl.pnlPercentage,
  });

  if (self.params.callbacks?.onClose) {
    self.params.callbacks.onClose(
      self.params.execution.context.symbol,
      signal,
      currentPrice,
      self.params.execution.context.backtest
    );
  }

  await self.params.risk.removeSignal(self.params.execution.context.symbol, {
    strategyName: self.params.method.context.strategyName,
    riskName: self.params.riskName,
  });

  await self.setPendingSignal(null);

  const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: signal,
    currentPrice: currentPrice,
    closeReason: closeReason,
    closeTimestamp: self.params.execution.context.when.getTime(),
    pnl: pnl,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const RETURN_PENDING_SIGNAL_ACTIVE_FN = async (
  self: ClientStrategy,
  signal: ISignalRow,
  currentPrice: number
): Promise<IStrategyTickResultActive> => {
  const result: IStrategyTickResultActive = {
    action: "active",
    signal: signal,
    currentPrice: currentPrice,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const RETURN_IDLE_FN = async (
  self: ClientStrategy,
  currentPrice: number
): Promise<IStrategyTickResultIdle> => {
  if (self.params.callbacks?.onIdle) {
    self.params.callbacks.onIdle(
      self.params.execution.context.symbol,
      currentPrice,
      self.params.execution.context.backtest
    );
  }

  const result: IStrategyTickResultIdle = {
    action: "idle",
    signal: null,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
    currentPrice: currentPrice,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  averagePrice: number,
  closeTimestamp: number
): Promise<IStrategyTickResultCancelled> => {
  self.params.logger.info("ClientStrategy backtest scheduled signal cancelled", {
    symbol: self.params.execution.context.symbol,
    signalId: scheduled.id,
    closeTimestamp,
    averagePrice,
    priceStopLoss: scheduled.priceStopLoss,
  });

  self._scheduledSignal = null;

  if (self.params.callbacks?.onCancel) {
    self.params.callbacks.onCancel(
      self.params.execution.context.symbol,
      scheduled,
      averagePrice,
      self.params.execution.context.backtest
    );
  }

  const result: IStrategyTickResultCancelled = {
    action: "cancelled",
    signal: scheduled,
    currentPrice: averagePrice,
    closeTimestamp: closeTimestamp,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow
): Promise<void> => {
  self.params.logger.info("ClientStrategy backtest scheduled signal activated", {
    symbol: self.params.execution.context.symbol,
    signalId: scheduled.id,
    priceOpen: scheduled.priceOpen,
  });

  self._scheduledSignal = null;
  await self.setPendingSignal(scheduled);

  await self.params.risk.addSignal(self.params.execution.context.symbol, {
    strategyName: self.params.method.context.strategyName,
    riskName: self.params.riskName,
  });

  if (self.params.callbacks?.onOpen) {
    self.params.callbacks.onOpen(
      self.params.execution.context.symbol,
      scheduled,
      scheduled.priceOpen,
      self.params.execution.context.backtest
    );
  }
};

const CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN = async (
  self: ClientStrategy,
  signal: ISignalRow,
  averagePrice: number,
  closeReason: "time_expired" | "take_profit" | "stop_loss",
  closeTimestamp: number
): Promise<IStrategyTickResultClosed> => {
  const pnl = toProfitLossDto(signal, averagePrice);

  self.params.logger.debug(`ClientStrategy backtest ${closeReason}`, {
    symbol: self.params.execution.context.symbol,
    signalId: signal.id,
    reason: closeReason,
    priceClose: averagePrice,
    closeTimestamp,
    pnlPercentage: pnl.pnlPercentage,
  });

  if (closeReason === "stop_loss") {
    self.params.logger.warn(
      `ClientStrategy backtest: Signal closed with loss (stop_loss), PNL: ${pnl.pnlPercentage.toFixed(
        2
      )}%`
    );
  }

  if (closeReason === "time_expired" && pnl.pnlPercentage < 0) {
    self.params.logger.warn(
      `ClientStrategy backtest: Signal closed with loss (time_expired), PNL: ${pnl.pnlPercentage.toFixed(
        2
      )}%`
    );
  }

  if (self.params.callbacks?.onClose) {
    self.params.callbacks.onClose(
      self.params.execution.context.symbol,
      signal,
      averagePrice,
      self.params.execution.context.backtest
    );
  }

  await self.params.risk.removeSignal(self.params.execution.context.symbol, {
    strategyName: self.params.method.context.strategyName,
    riskName: self.params.riskName,
  });

  await self.setPendingSignal(null);

  const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: signal,
    currentPrice: averagePrice,
    closeReason: closeReason,
    closeTimestamp: closeTimestamp,
    pnl: pnl,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
  };

  if (self.params.callbacks?.onTick) {
    self.params.callbacks.onTick(
      self.params.execution.context.symbol,
      result,
      self.params.execution.context.backtest
    );
  }

  return result;
};

const PROCESS_SCHEDULED_SIGNAL_CANDLES_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  candles: ICandleData[]
): Promise<{
  activated: boolean;
  cancelled: boolean;
  activationIndex: number;
  result: IStrategyTickResultCancelled | null;
}> => {
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const recentCandles = candles.slice(Math.max(0, i - 4), i + 1);
    const averagePrice = GET_AVG_PRICE_FN(recentCandles);

    let shouldActivate = false;
    let shouldCancel = false;

    if (scheduled.position === "long") {
      if (candle.low <= scheduled.priceOpen) {
        shouldActivate = true;
      }
      if (candle.low <= scheduled.priceStopLoss) {
        shouldCancel = true;
      }
    }

    if (scheduled.position === "short") {
      if (candle.high >= scheduled.priceOpen) {
        shouldActivate = true;
      }
      if (candle.high >= scheduled.priceStopLoss) {
        shouldCancel = true;
      }
    }

    if (shouldCancel) {
      const result = await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
        self,
        scheduled,
        averagePrice,
        candle.timestamp
      );
      return { activated: false, cancelled: true, activationIndex: i, result };
    }

    if (shouldActivate) {
      await ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN(self, scheduled);
      return { activated: true, cancelled: false, activationIndex: i, result: null };
    }
  }

  return { activated: false, cancelled: false, activationIndex: -1, result: null };
};

const PROCESS_PENDING_SIGNAL_CANDLES_FN = async (
  self: ClientStrategy,
  signal: ISignalRow,
  candles: ICandleData[]
): Promise<IStrategyTickResultClosed | null> => {
  for (let i = 4; i < candles.length; i++) {
    const recentCandles = candles.slice(i - 4, i + 1);
    const averagePrice = GET_AVG_PRICE_FN(recentCandles);

    let shouldClose = false;
    let closeReason: "time_expired" | "take_profit" | "stop_loss" | undefined;

    if (signal.position === "long") {
      if (averagePrice >= signal.priceTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
      } else if (averagePrice <= signal.priceStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
      }
    }

    if (signal.position === "short") {
      if (averagePrice <= signal.priceTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
      } else if (averagePrice >= signal.priceStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
      }
    }

    if (shouldClose) {
      const closeTimestamp = recentCandles[recentCandles.length - 1].timestamp;
      return await CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN(
        self,
        signal,
        averagePrice,
        closeReason!,
        closeTimestamp
      );
    }
  }

  return null;
};

/**
 * Client implementation for trading strategy lifecycle management.
 *
 * Features:
 * - Signal generation with interval throttling
 * - Automatic signal validation (prices, TP/SL logic, timestamps)
 * - Crash-safe persistence in live mode
 * - VWAP-based TP/SL monitoring
 * - Fast backtest with candle array processing
 *
 * All methods use prototype functions for memory efficiency.
 *
 * @example
 * ```typescript
 * const strategy = new ClientStrategy({
 *   strategyName: "my-strategy",
 *   interval: "5m",
 *   getSignal: async (symbol) => ({ ... }),
 *   execution: executionService,
 *   exchange: exchangeService,
 *   logger: loggerService,
 * });
 *
 * await strategy.waitForInit(); // Load persisted state
 * const result = await strategy.tick(); // Monitor signal
 * ```
 */
export class ClientStrategy implements IStrategy {
  _isStopped = false;
  _pendingSignal: ISignalRow | null = null;
  _scheduledSignal: IScheduledSignalRow | null = null;
  _lastSignalTimestamp: number | null = null;

  constructor(readonly params: IStrategyParams) {}

  /**
   * Initializes strategy state by loading persisted signal from disk.
   *
   * Uses singleshot pattern to ensure initialization happens exactly once.
   * In backtest mode: skips persistence, no state to load
   * In live mode: reads last signal state from disk
   *
   * @returns Promise that resolves when initialization is complete
   */
  public waitForInit = singleshot(async () => await WAIT_FOR_INIT_FN(this));

  /**
   * Updates pending signal and persists to disk in live mode.
   *
   * Centralized method for all signal state changes.
   * Uses atomic file writes to prevent corruption.
   *
   * @param pendingSignal - New signal state (null to clear)
   * @returns Promise that resolves when update is complete
   */
  public async setPendingSignal(pendingSignal: ISignalRow | null) {
    this.params.logger.debug("ClientStrategy setPendingSignal", {
      pendingSignal,
    });
    this._pendingSignal = pendingSignal;
    if (this.params.execution.context.backtest) {
      return;
    }
    await PersistSignalAdaper.writeSignalData(
      this._pendingSignal,
      this.params.strategyName,
      this.params.execution.context.symbol
    );
  }

  /**
   * Performs a single tick of strategy execution.
   *
   * Flow (LIVE mode):
   * 1. If scheduled signal exists: check activation/cancellation
   * 2. If no pending/scheduled signal: call getSignal with throttling and validation
   * 3. If signal opened: trigger onOpen callback, persist state
   * 4. If pending signal exists: check VWAP against TP/SL
   * 5. If TP/SL/time reached: close signal, trigger onClose, persist state
   *
   * Flow (BACKTEST mode):
   * 1. If no pending/scheduled signal: call getSignal
   * 2. If scheduled signal created: return "scheduled" (backtest() will handle it)
   * 3. Otherwise same as LIVE
   *
   * @returns Promise resolving to discriminated union result:
   * - idle: No signal generated
   * - scheduled: Scheduled signal created (backtest only)
   * - opened: New signal just created
   * - active: Signal monitoring in progress
   * - closed: Signal completed with PNL
   *
   * @example
   * ```typescript
   * const result = await strategy.tick();
   * if (result.action === "closed") {
   *   console.log(`PNL: ${result.pnl.pnlPercentage}%`);
   * }
   * ```
   */
  public async tick(): Promise<IStrategyTickResult> {
    this.params.logger.debug("ClientStrategy tick");

    // Monitor scheduled signal
    if (this._scheduledSignal && !this._pendingSignal) {
      const currentPrice = await this.params.exchange.getAveragePrice(
        this.params.execution.context.symbol
      );

      // Check timeout
      const timeoutResult = await CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN(
        this,
        this._scheduledSignal,
        currentPrice
      );
      if (timeoutResult) return timeoutResult;

      // Check price-based activation/cancellation
      const { shouldActivate, shouldCancel } = CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN(
        this._scheduledSignal,
        currentPrice
      );

      if (shouldCancel) {
        return await CANCEL_SCHEDULED_SIGNAL_BY_STOPLOSS_FN(
          this,
          this._scheduledSignal,
          currentPrice
        );
      }

      if (shouldActivate) {
        return await ACTIVATE_SCHEDULED_SIGNAL_FN(this, this._scheduledSignal);
      }

      return await RETURN_SCHEDULED_SIGNAL_ACTIVE_FN(
        this,
        this._scheduledSignal,
        currentPrice
      );
    }

    // Generate new signal if none exists
    if (!this._pendingSignal && !this._scheduledSignal) {
      const signal = await GET_SIGNAL_FN(this);

      if (!signal) {
        await this.setPendingSignal(null);
      } else {
        // @ts-ignore - check runtime marker
        if (signal._isScheduled === true) {
          this._scheduledSignal = signal as IScheduledSignalRow;
          return await OPEN_NEW_SCHEDULED_SIGNAL_FN(this, this._scheduledSignal);
        }

        await this.setPendingSignal(signal);
      }

      if (this._pendingSignal) {
        return await OPEN_NEW_PENDING_SIGNAL_FN(this, this._pendingSignal);
      }

      const currentPrice = await this.params.exchange.getAveragePrice(
        this.params.execution.context.symbol
      );

      return await RETURN_IDLE_FN(this, currentPrice);
    }

    // Monitor pending signal
    const averagePrice = await this.params.exchange.getAveragePrice(
      this.params.execution.context.symbol
    );

    const closedResult = await CHECK_PENDING_SIGNAL_COMPLETION_FN(
      this,
      this._pendingSignal,
      averagePrice
    );

    if (closedResult) {
      return closedResult;
    }

    return await RETURN_PENDING_SIGNAL_ACTIVE_FN(
      this,
      this._pendingSignal,
      averagePrice
    );
  }

  /**
   * Fast backtests a signal using historical candle data.
   *
   * For scheduled signals:
   * 1. Iterates through candles checking for activation (price reaches priceOpen)
   * 2. Or cancellation (price hits StopLoss before activation)
   * 3. If activated: converts to pending signal and continues with TP/SL monitoring
   * 4. If cancelled: returns closed result with closeReason "cancelled"
   *
   * For pending signals:
   * 1. Iterates through candles checking VWAP against TP/SL on each timeframe
   * 2. Starts from index 4 (needs 5 candles for VWAP calculation)
   * 3. Returns closed result (either TP/SL or time_expired)
   *
   * @param candles - Array of candles to process
   * @returns Promise resolving to closed signal result with PNL
   * @throws Error if no pending/scheduled signal or not in backtest mode
   *
   * @example
   * ```typescript
   * // After signal opened in backtest
   * const candles = await exchange.getNextCandles("BTCUSDT", "1m", signal.minuteEstimatedTime);
   * const result = await strategy.backtest(candles);
   * console.log(result.closeReason); // "take_profit" | "stop_loss" | "time_expired" | "cancelled"
   * ```
   */
  public async backtest(
    candles: ICandleData[]
  ): Promise<IStrategyBacktestResult> {
    this.params.logger.debug("ClientStrategy backtest", {
      symbol: this.params.execution.context.symbol,
      candlesCount: candles.length,
      hasScheduled: !!this._scheduledSignal,
      hasPending: !!this._pendingSignal,
    });

    if (!this.params.execution.context.backtest) {
      throw new Error("ClientStrategy backtest: running in live context");
    }

    if (!this._pendingSignal && !this._scheduledSignal) {
      throw new Error("ClientStrategy backtest: no pending or scheduled signal");
    }

    // Process scheduled signal
    if (this._scheduledSignal && !this._pendingSignal) {
      const scheduled = this._scheduledSignal;

      this.params.logger.debug("ClientStrategy backtest scheduled signal", {
        symbol: this.params.execution.context.symbol,
        signalId: scheduled.id,
        priceOpen: scheduled.priceOpen,
        position: scheduled.position,
      });

      const { activated, cancelled, activationIndex, result } =
        await PROCESS_SCHEDULED_SIGNAL_CANDLES_FN(this, scheduled, candles);

      if (cancelled && result) {
        return result;
      }

      if (activated) {
        const remainingCandles = candles.slice(activationIndex + 1);

        if (remainingCandles.length === 0) {
          const recentCandles = candles.slice(Math.max(0, activationIndex - 4), activationIndex + 1);
          const lastPrice = GET_AVG_PRICE_FN(recentCandles);
          const closeTimestamp = candles[activationIndex].timestamp;

          return await CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN(
            this,
            scheduled,
            lastPrice,
            "time_expired",
            closeTimestamp
          );
        }

        candles = remainingCandles;
      }

      if (this._scheduledSignal) {
        const lastCandles = candles.slice(-5);
        const lastPrice = GET_AVG_PRICE_FN(lastCandles);
        const closeTimestamp = candles[candles.length - 1].timestamp;

        this.params.logger.info("ClientStrategy backtest scheduled signal not activated (cancelled)", {
          symbol: this.params.execution.context.symbol,
          signalId: scheduled.id,
          closeTimestamp,
          reason: "price never reached priceOpen",
        });

        return await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
          this,
          scheduled,
          lastPrice,
          closeTimestamp
        );
      }
    }

    // Process pending signal
    const signal = this._pendingSignal;

    if (!signal) {
      throw new Error("ClientStrategy backtest: no pending signal after scheduled activation");
    }

    if (candles.length < 5) {
      this.params.logger.warn(
        `ClientStrategy backtest: Expected at least 5 candles for VWAP, got ${candles.length}`
      );
    }

    const closedResult = await PROCESS_PENDING_SIGNAL_CANDLES_FN(this, signal, candles);

    if (closedResult) {
      return closedResult;
    }

    const lastFiveCandles = candles.slice(-5);
    const lastPrice = GET_AVG_PRICE_FN(lastFiveCandles);
    const closeTimestamp = lastFiveCandles[lastFiveCandles.length - 1].timestamp;

    return await CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN(
      this,
      signal,
      lastPrice,
      "time_expired",
      closeTimestamp
    );
  }

  /**
   * Stops the strategy from generating new signals.
   *
   * Sets internal flag to prevent getSignal from being called.
   * Does NOT close active pending signals - they continue monitoring until TP/SL/time_expired.
   *
   * Use case: Graceful shutdown in live trading without forcing position closure.
   *
   * @returns Promise that resolves immediately when stop flag is set
   *
   * @example
   * ```typescript
   * // In Live.background() cancellation
   * await strategy.stop();
   * // Existing signal will continue until natural close
   * ```
   */
  public stop(): Promise<void> {
    this.params.logger.debug("ClientStrategy stop", {
      hasPendingSignal: this._pendingSignal !== null,
    });

    this._isStopped = true;

    return Promise.resolve();
  }
}

export default ClientStrategy;
