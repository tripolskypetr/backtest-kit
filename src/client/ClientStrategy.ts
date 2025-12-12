import {
  errorData,
  getErrorMessage,
  not,
  randomString,
  singleshot,
  sleep,
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
  SignalInterval,
  StrategyName,
} from "../interfaces/Strategy.interface";
import toProfitLossDto from "../helpers/toProfitLossDto";
import { ICandleData } from "../interfaces/Exchange.interface";
import { PersistSignalAdapter, PersistScheduleAdapter } from "../classes/Persist";
import backtest from "../lib";
import { errorEmitter } from "../config/emitters";
import { GLOBAL_CONFIG } from "../config/params";
import toPlainString from "../helpers/toPlainString";

const INTERVAL_MINUTES: Record<SignalInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
};

const TIMEOUT_SYMBOL = Symbol('timeout');

const VALIDATE_SIGNAL_FN = (signal: ISignalRow, currentPrice: number, isScheduled: boolean): void => {
  const errors: string[] = [];

  // ПРОВЕРКА ОБЯЗАТЕЛЬНЫХ ПОЛЕЙ ISignalRow
  if (signal.id === undefined || signal.id === null || signal.id === '') {
    errors.push('id is required and must be a non-empty string');
  }
  if (signal.exchangeName === undefined || signal.exchangeName === null || signal.exchangeName === '') {
    errors.push('exchangeName is required');
  }
  if (signal.strategyName === undefined || signal.strategyName === null || signal.strategyName === '') {
    errors.push('strategyName is required');
  }
  if (signal.symbol === undefined || signal.symbol === null || signal.symbol === '') {
    errors.push('symbol is required and must be a non-empty string');
  }
  if (signal._isScheduled === undefined || signal._isScheduled === null) {
    errors.push('_isScheduled is required');
  }
  if (signal.position === undefined || signal.position === null) {
    errors.push('position is required and must be "long" or "short"');
  }
  if (signal.position !== "long" && signal.position !== "short") {
    errors.push(`position must be "long" or "short", got "${signal.position}"`);
  }

  // ЗАЩИТА ОТ NaN/Infinity: currentPrice должна быть конечным числом
  if (!isFinite(currentPrice)) {
    errors.push(
      `currentPrice must be a finite number, got ${currentPrice} (${typeof currentPrice})`
    );
  }
  if (isFinite(currentPrice) && currentPrice <= 0) {
    errors.push(`currentPrice must be positive, got ${currentPrice}`);
  }

  // ЗАЩИТА ОТ NaN/Infinity: все цены должны быть конечными числами
  if (!isFinite(signal.priceOpen)) {
    errors.push(
      `priceOpen must be a finite number, got ${signal.priceOpen} (${typeof signal.priceOpen})`
    );
  }
  if (!isFinite(signal.priceTakeProfit)) {
    errors.push(
      `priceTakeProfit must be a finite number, got ${signal.priceTakeProfit} (${typeof signal.priceTakeProfit})`
    );
  }
  if (!isFinite(signal.priceStopLoss)) {
    errors.push(
      `priceStopLoss must be a finite number, got ${signal.priceStopLoss} (${typeof signal.priceStopLoss})`
    );
  }

  // Валидация цен (только если они конечные)
  if (isFinite(signal.priceOpen) && signal.priceOpen <= 0) {
    errors.push(`priceOpen must be positive, got ${signal.priceOpen}`);
  }
  if (isFinite(signal.priceTakeProfit) && signal.priceTakeProfit <= 0) {
    errors.push(
      `priceTakeProfit must be positive, got ${signal.priceTakeProfit}`
    );
  }
  if (isFinite(signal.priceStopLoss) && signal.priceStopLoss <= 0) {
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

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ: проверяем что позиция не закроется сразу после открытия
    if (!isScheduled && isFinite(currentPrice)) {
      // LONG: currentPrice должна быть МЕЖДУ SL и TP (не пробита ни одна граница)
      // SL < currentPrice < TP
      if (currentPrice <= signal.priceStopLoss) {
        errors.push(
          `Long immediate: currentPrice (${currentPrice}) <= priceStopLoss (${signal.priceStopLoss}). ` +
            `Signal would be immediately closed by stop loss. Cannot open position that is already stopped out.`
        );
      }

      if (currentPrice >= signal.priceTakeProfit) {
        errors.push(
          `Long immediate: currentPrice (${currentPrice}) >= priceTakeProfit (${signal.priceTakeProfit}). ` +
            `Signal would be immediately closed by take profit. The profit opportunity has already passed.`
        );
      }
    }

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ scheduled сигналов
    if (isScheduled && isFinite(signal.priceOpen)) {
      // LONG scheduled: priceOpen должен быть МЕЖДУ SL и TP
      // SL < priceOpen < TP
      if (signal.priceOpen <= signal.priceStopLoss) {
        errors.push(
          `Long scheduled: priceOpen (${signal.priceOpen}) <= priceStopLoss (${signal.priceStopLoss}). ` +
            `Signal would be immediately cancelled on activation. Cannot activate position that is already stopped out.`
        );
      }

      if (signal.priceOpen >= signal.priceTakeProfit) {
        errors.push(
          `Long scheduled: priceOpen (${signal.priceOpen}) >= priceTakeProfit (${signal.priceTakeProfit}). ` +
            `Signal would close immediately on activation. This is logically impossible for LONG position.`
        );
      }
    }

    // ЗАЩИТА ОТ МИКРО-ПРОФИТА: TakeProfit должен быть достаточно далеко, чтобы покрыть комиссии
    if (GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT) {
      const tpDistancePercent =
        ((signal.priceTakeProfit - signal.priceOpen) / signal.priceOpen) * 100;
      if (tpDistancePercent < GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT) {
        errors.push(
          `Long: TakeProfit too close to priceOpen (${tpDistancePercent.toFixed(3)}%). ` +
            `Minimum distance: ${GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT}% to cover trading fees. ` +
            `Current: TP=${signal.priceTakeProfit}, Open=${signal.priceOpen}`
        );
      }
    }

    // ЗАЩИТА ОТ СЛИШКОМ УЗКОГО STOPLOSS: минимальный буфер для избежания моментального закрытия
    if (GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT) {
      const slDistancePercent =
        ((signal.priceOpen - signal.priceStopLoss) / signal.priceOpen) * 100;
      if (slDistancePercent < GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT) {
        errors.push(
          `Long: StopLoss too close to priceOpen (${slDistancePercent.toFixed(3)}%). ` +
            `Minimum distance: ${GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT}% to avoid instant stop out on market volatility. ` +
            `Current: SL=${signal.priceStopLoss}, Open=${signal.priceOpen}`
        );
      }
    }

    // ЗАЩИТА ОТ ЭКСТРЕМАЛЬНОГО STOPLOSS: ограничиваем максимальный убыток
    if (GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT) {
      const slDistancePercent =
        ((signal.priceOpen - signal.priceStopLoss) / signal.priceOpen) * 100;
      if (slDistancePercent > GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT) {
        errors.push(
          `Long: StopLoss too far from priceOpen (${slDistancePercent.toFixed(3)}%). ` +
            `Maximum distance: ${GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT}% to protect capital. ` +
            `Current: SL=${signal.priceStopLoss}, Open=${signal.priceOpen}`
        );
      }
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

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ: проверяем что позиция не закроется сразу после открытия
    if (!isScheduled && isFinite(currentPrice)) {
      // SHORT: currentPrice должна быть МЕЖДУ TP и SL (не пробита ни одна граница)
      // TP < currentPrice < SL
      if (currentPrice >= signal.priceStopLoss) {
        errors.push(
          `Short immediate: currentPrice (${currentPrice}) >= priceStopLoss (${signal.priceStopLoss}). ` +
            `Signal would be immediately closed by stop loss. Cannot open position that is already stopped out.`
        );
      }

      if (currentPrice <= signal.priceTakeProfit) {
        errors.push(
          `Short immediate: currentPrice (${currentPrice}) <= priceTakeProfit (${signal.priceTakeProfit}). ` +
            `Signal would be immediately closed by take profit. The profit opportunity has already passed.`
        );
      }
    }

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ scheduled сигналов
    if (isScheduled && isFinite(signal.priceOpen)) {
      // SHORT scheduled: priceOpen должен быть МЕЖДУ TP и SL
      // TP < priceOpen < SL
      if (signal.priceOpen >= signal.priceStopLoss) {
        errors.push(
          `Short scheduled: priceOpen (${signal.priceOpen}) >= priceStopLoss (${signal.priceStopLoss}). ` +
            `Signal would be immediately cancelled on activation. Cannot activate position that is already stopped out.`
        );
      }

      if (signal.priceOpen <= signal.priceTakeProfit) {
        errors.push(
          `Short scheduled: priceOpen (${signal.priceOpen}) <= priceTakeProfit (${signal.priceTakeProfit}). ` +
            `Signal would close immediately on activation. This is logically impossible for SHORT position.`
        );
      }
    }

    // ЗАЩИТА ОТ МИКРО-ПРОФИТА: TakeProfit должен быть достаточно далеко, чтобы покрыть комиссии
    if (GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT) {
      const tpDistancePercent =
        ((signal.priceOpen - signal.priceTakeProfit) / signal.priceOpen) * 100;
      if (tpDistancePercent < GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT) {
        errors.push(
          `Short: TakeProfit too close to priceOpen (${tpDistancePercent.toFixed(3)}%). ` +
            `Minimum distance: ${GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT}% to cover trading fees. ` +
            `Current: TP=${signal.priceTakeProfit}, Open=${signal.priceOpen}`
        );
      }
    }

    // ЗАЩИТА ОТ СЛИШКОМ УЗКОГО STOPLOSS: минимальный буфер для избежания моментального закрытия
    if (GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT) {
      const slDistancePercent =
        ((signal.priceStopLoss - signal.priceOpen) / signal.priceOpen) * 100;
      if (slDistancePercent < GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT) {
        errors.push(
          `Short: StopLoss too close to priceOpen (${slDistancePercent.toFixed(3)}%). ` +
            `Minimum distance: ${GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT}% to avoid instant stop out on market volatility. ` +
            `Current: SL=${signal.priceStopLoss}, Open=${signal.priceOpen}`
        );
      }
    }

    // ЗАЩИТА ОТ ЭКСТРЕМАЛЬНОГО STOPLOSS: ограничиваем максимальный убыток
    if (GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT) {
      const slDistancePercent =
        ((signal.priceStopLoss - signal.priceOpen) / signal.priceOpen) * 100;
      if (slDistancePercent > GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT) {
        errors.push(
          `Short: StopLoss too far from priceOpen (${slDistancePercent.toFixed(3)}%). ` +
            `Maximum distance: ${GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT}% to protect capital. ` +
            `Current: SL=${signal.priceStopLoss}, Open=${signal.priceOpen}`
        );
      }
    }
  }

  // Валидация временных параметров
  if (signal.minuteEstimatedTime <= 0) {
    errors.push(
      `minuteEstimatedTime must be positive, got ${signal.minuteEstimatedTime}`
    );
  }
  if (!Number.isInteger(signal.minuteEstimatedTime)) {
    errors.push(
      `minuteEstimatedTime must be an integer (whole number), got ${signal.minuteEstimatedTime}`
    );
  }

  // ЗАЩИТА ОТ ВЕЧНЫХ СИГНАЛОВ: ограничиваем максимальное время жизни сигнала
  if (GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES && GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES) {
    if (signal.minuteEstimatedTime > GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES) {
      const days = (signal.minuteEstimatedTime / 60 / 24).toFixed(1);
      const maxDays = (GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES / 60 / 24).toFixed(0);
      errors.push(
        `minuteEstimatedTime too large (${signal.minuteEstimatedTime} minutes = ${days} days). ` +
          `Maximum: ${GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES} minutes (${maxDays} days) to prevent strategy deadlock. ` +
          `Eternal signals block risk limits and prevent new trades.`
      );
    }
  }
  if (signal.scheduledAt <= 0) {
    errors.push(`scheduledAt must be positive, got ${signal.scheduledAt}`);
  }
  if (signal.pendingAt <= 0) {
    errors.push(`pendingAt must be positive, got ${signal.pendingAt}`);
  }

  // Кидаем ошибку если есть проблемы
  if (errors.length > 0) {
    throw new Error(
      `Invalid signal for ${signal.position} position:\n${errors.join("\n")}`
    );
  }
};

const GET_SIGNAL_FN = trycatch(
  async (
    self: ClientStrategy
  ): Promise<ISignalRow | IScheduledSignalRow | null> => {
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
    const currentPrice = await self.params.exchange.getAveragePrice(
      self.params.execution.context.symbol
    );
    const timeoutMs = GLOBAL_CONFIG.CC_MAX_SIGNAL_GENERATION_SECONDS * 1_000;
    const signal = await Promise.race([
      self.params.getSignal(
        self.params.execution.context.symbol,
        self.params.execution.context.when,
      ),
      sleep(timeoutMs).then(() => TIMEOUT_SYMBOL),
    ]);
    if (typeof signal === "symbol") {
      throw new Error(`Timeout for ${self.params.method.context.strategyName} symbol=${self.params.execution.context.symbol}`);
    }
    if (!signal) {
      return null;
    }
    if (self._isStopped) {
      return null;
    }
    if (
      await not(
        self.params.risk.checkSignal({
          pendingSignal: signal,
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
    // Если priceOpen указан - проверяем нужно ли ждать активации или открыть сразу
    if (signal.priceOpen !== undefined) {
      // КРИТИЧЕСКАЯ ПРОВЕРКА: достигнут ли priceOpen?
      // LONG: если currentPrice <= priceOpen - цена уже упала достаточно, открываем сразу
      // SHORT: если currentPrice >= priceOpen - цена уже выросла достаточно, открываем сразу
      const shouldActivateImmediately =
        (signal.position === "long" && currentPrice <= signal.priceOpen) ||
        (signal.position === "short" && currentPrice >= signal.priceOpen);

      if (shouldActivateImmediately) {
        // НЕМЕДЛЕННАЯ АКТИВАЦИЯ: priceOpen уже достигнут
        // Создаем активный сигнал напрямую (БЕЗ scheduled фазы)
        const signalRow: ISignalRow = {
          id: randomString(),
          priceOpen: signal.priceOpen, // Используем priceOpen из сигнала
          position: signal.position,
          note: toPlainString(signal.note),
          priceTakeProfit: signal.priceTakeProfit,
          priceStopLoss: signal.priceStopLoss,
          minuteEstimatedTime: signal.minuteEstimatedTime,
          symbol: self.params.execution.context.symbol,
          exchangeName: self.params.method.context.exchangeName,
          strategyName: self.params.method.context.strategyName,
          scheduledAt: currentTime,
          pendingAt: currentTime, // Для immediate signal оба времени одинаковые
          _isScheduled: false,
        };

        // Валидируем сигнал перед возвратом
        VALIDATE_SIGNAL_FN(signalRow, currentPrice, false);

        return signalRow;
      }

      // ОЖИДАНИЕ АКТИВАЦИИ: создаем scheduled signal (risk check при активации)
      const scheduledSignalRow: IScheduledSignalRow = {
        id: randomString(),
        priceOpen: signal.priceOpen,
        position: signal.position,
        note: toPlainString(signal.note),
        priceTakeProfit: signal.priceTakeProfit,
        priceStopLoss: signal.priceStopLoss,
        minuteEstimatedTime: signal.minuteEstimatedTime,
        symbol: self.params.execution.context.symbol,
        exchangeName: self.params.method.context.exchangeName,
        strategyName: self.params.method.context.strategyName,
        scheduledAt: currentTime,
        pendingAt: currentTime, // Временно, обновится при активации
        _isScheduled: true,
      };

      // Валидируем сигнал перед возвратом
      VALIDATE_SIGNAL_FN(scheduledSignalRow, currentPrice, true);

      return scheduledSignalRow;
    }

    const signalRow: ISignalRow = {
      id: randomString(),
      priceOpen: currentPrice,
      ...signal,
      note: toPlainString(signal.note),
      symbol: self.params.execution.context.symbol,
      exchangeName: self.params.method.context.exchangeName,
      strategyName: self.params.method.context.strategyName,
      scheduledAt: currentTime,
      pendingAt: currentTime, // Для immediate signal оба времени одинаковые
      _isScheduled: false,
    };

    // Валидируем сигнал перед возвратом
    VALIDATE_SIGNAL_FN(signalRow, currentPrice, false);

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

  // Restore pending signal
  const pendingSignal = await PersistSignalAdapter.readSignalData(
    self.params.execution.context.symbol,
    self.params.strategyName,
  );
  if (pendingSignal) {
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
  }

  // Restore scheduled signal
  const scheduledSignal = await PersistScheduleAdapter.readScheduleData(
    self.params.execution.context.symbol,
    self.params.strategyName,
  );
  if (scheduledSignal) {
    if (scheduledSignal.exchangeName !== self.params.method.context.exchangeName) {
      return;
    }
    if (scheduledSignal.strategyName !== self.params.method.context.strategyName) {
      return;
    }
    self._scheduledSignal = scheduledSignal;

    // Call onSchedule callback for restored scheduled signal
    if (self.params.callbacks?.onSchedule) {
      const currentPrice = await self.params.exchange.getAveragePrice(
        self.params.execution.context.symbol
      );
      self.params.callbacks.onSchedule(
        self.params.execution.context.symbol,
        scheduledSignal,
        currentPrice,
        self.params.execution.context.backtest
      );
    }
  }
};

const CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  currentPrice: number
): Promise<IStrategyTickResultCancelled | null> => {
  const currentTime = self.params.execution.context.when.getTime();
  const signalTime = scheduled.scheduledAt; // Таймаут для scheduled signal считается от scheduledAt
  const maxTimeToWait = GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES * 60 * 1000;
  const elapsedTime = currentTime - signalTime;

  if (elapsedTime < maxTimeToWait) {
    return null;
  }

  self.params.logger.info(
    "ClientStrategy scheduled signal cancelled by timeout",
    {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
      elapsedMinutes: Math.floor(elapsedTime / 60000),
      maxMinutes: GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES,
    }
  );

  await self.setScheduledSignal(null);

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
    // КРИТИЧНО: Сначала проверяем StopLoss (отмена приоритетнее активации)
    // Отмена если цена упала СЛИШКОМ низко (ниже SL)
    if (currentPrice <= scheduled.priceStopLoss) {
      shouldCancel = true;
    }
    // Long = покупаем дешевле, ждем падения цены ДО priceOpen
    // Активируем только если НЕ пробит StopLoss
    else if (currentPrice <= scheduled.priceOpen) {
      shouldActivate = true;
    }
  }

  if (scheduled.position === "short") {
    // КРИТИЧНО: Сначала проверяем StopLoss (отмена приоритетнее активации)
    // Отмена если цена выросла СЛИШКОМ высоко (выше SL)
    if (currentPrice >= scheduled.priceStopLoss) {
      shouldCancel = true;
    }
    // Short = продаем дороже, ждем роста цены ДО priceOpen
    // Активируем только если НЕ пробит StopLoss
    else if (currentPrice >= scheduled.priceOpen) {
      shouldActivate = true;
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

  await self.setScheduledSignal(null);

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
  scheduled: IScheduledSignalRow,
  activationTimestamp: number
): Promise<IStrategyTickResultOpened | null> => {
  // Check if strategy was stopped
  if (self._isStopped) {
    self.params.logger.info("ClientStrategy scheduled signal activation cancelled (stopped)", {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
    });
    await self.setScheduledSignal(null);
    return null;
  }

  // В LIVE режиме activationTimestamp - это текущее время при tick()
  // В отличие от BACKTEST (где используется candle.timestamp + 60s),
  // здесь мы не знаем ТОЧНОЕ время достижения priceOpen,
  // поэтому используем время обнаружения активации
  const activationTime = activationTimestamp;

  self.params.logger.info("ClientStrategy scheduled signal activation begin", {
    symbol: self.params.execution.context.symbol,
    signalId: scheduled.id,
    position: scheduled.position,
    averagePrice: scheduled.priceOpen,
    priceOpen: scheduled.priceOpen,
    scheduledAt: scheduled.scheduledAt,
    pendingAt: activationTime,
  });
  if (
    await not(
        self.params.risk.checkSignal({
          symbol: self.params.execution.context.symbol,
          pendingSignal: scheduled,
          strategyName: self.params.method.context.strategyName,
          exchangeName: self.params.method.context.exchangeName,
          currentPrice: scheduled.priceOpen,
          timestamp: activationTime,
      })
    )
  ) {
    self.params.logger.info("ClientStrategy scheduled signal rejected by risk", {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
    });
    await self.setScheduledSignal(null);
    return null;
  }

  await self.setScheduledSignal(null);

  // КРИТИЧЕСКИ ВАЖНО: обновляем pendingAt при активации
  const activatedSignal: ISignalRow = {
    ...scheduled,
    pendingAt: activationTime,
    _isScheduled: false,
  };

  await self.setPendingSignal(activatedSignal);

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
    percentTp: 0,
    percentSl: 0,
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
): Promise<IStrategyTickResultOpened | null> => {
  if (
    await not(
      self.params.risk.checkSignal({
        pendingSignal: signal,
        symbol: self.params.execution.context.symbol,
        strategyName: self.params.method.context.strategyName,
        exchangeName: self.params.method.context.exchangeName,
        currentPrice: signal.priceOpen,
        timestamp: self.params.execution.context.when.getTime(),
      })
    )
  ) {
    return null;
  }

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
  const signalTime = signal.pendingAt; // КРИТИЧНО: используем pendingAt, а не scheduledAt!
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
      signal.priceTakeProfit, // КРИТИЧНО: используем точную цену TP
      "take_profit"
    );
  }

  if (signal.position === "short" && averagePrice <= signal.priceTakeProfit) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      signal.priceTakeProfit, // КРИТИЧНО: используем точную цену TP
      "take_profit"
    );
  }

  // Check stop loss
  if (signal.position === "long" && averagePrice <= signal.priceStopLoss) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      signal.priceStopLoss, // КРИТИЧНО: используем точную цену SL
      "stop_loss"
    );
  }

  if (signal.position === "short" && averagePrice >= signal.priceStopLoss) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      signal.priceStopLoss, // КРИТИЧНО: используем точную цену SL
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

  // КРИТИЧНО: Очищаем состояние ClientPartial при закрытии позиции
  await self.params.partial.clear(
    self.params.execution.context.symbol,
    signal,
    currentPrice,
    self.params.execution.context.backtest,
  );

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
  let percentTp = 0;
  let percentSl = 0;

  // Calculate percentage of path to TP/SL for partial fill/loss callbacks
  {
    if (signal.position === "long") {
      // For long: calculate progress towards TP or SL
      const currentDistance = currentPrice - signal.priceOpen;

      if (currentDistance > 0) {
        // Moving towards TP
        const tpDistance = signal.priceTakeProfit - signal.priceOpen;
        const progressPercent = (currentDistance / tpDistance) * 100;
        percentTp = Math.min(progressPercent, 100);

        await self.params.partial.profit(
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentTp,
          self.params.execution.context.backtest,
          self.params.execution.context.when
        );

        if (self.params.callbacks?.onPartialProfit) {
          self.params.callbacks.onPartialProfit(
            self.params.execution.context.symbol,
            signal,
            currentPrice,
            percentTp,
            self.params.execution.context.backtest
          );
        }
      } else if (currentDistance < 0) {
        // Moving towards SL
        const slDistance = signal.priceOpen - signal.priceStopLoss;
        const progressPercent = (Math.abs(currentDistance) / slDistance) * 100;
        percentSl = Math.min(progressPercent, 100);

        await self.params.partial.loss(
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentSl,
          self.params.execution.context.backtest,
          self.params.execution.context.when
        );

        if (self.params.callbacks?.onPartialLoss) {
          self.params.callbacks.onPartialLoss(
            self.params.execution.context.symbol,
            signal,
            currentPrice,
            percentSl,
            self.params.execution.context.backtest
          );
        }
      }
    } else if (signal.position === "short") {
      // For short: calculate progress towards TP or SL
      const currentDistance = signal.priceOpen - currentPrice;

      if (currentDistance > 0) {
        // Moving towards TP
        const tpDistance = signal.priceOpen - signal.priceTakeProfit;
        const progressPercent = (currentDistance / tpDistance) * 100;
        percentTp = Math.min(progressPercent, 100);

        await self.params.partial.profit(
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentTp,
          self.params.execution.context.backtest,
          self.params.execution.context.when
        );

        if (self.params.callbacks?.onPartialProfit) {
          self.params.callbacks.onPartialProfit(
            self.params.execution.context.symbol,
            signal,
            currentPrice,
            percentTp,
            self.params.execution.context.backtest
          );
        }
      }

      if (currentDistance < 0) {
        // Moving towards SL
        const slDistance = signal.priceStopLoss - signal.priceOpen;
        const progressPercent = (Math.abs(currentDistance) / slDistance) * 100;
        percentSl = Math.min(progressPercent, 100);

        await self.params.partial.loss(
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentSl,
          self.params.execution.context.backtest,
          self.params.execution.context.when
        );

        if (self.params.callbacks?.onPartialLoss) {
          self.params.callbacks.onPartialLoss(
            self.params.execution.context.symbol,
            signal,
            currentPrice,
            percentSl,
            self.params.execution.context.backtest
          );
        }
      }
    }
  }

  const result: IStrategyTickResultActive = {
    action: "active",
    signal: signal,
    currentPrice: currentPrice,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    symbol: self.params.execution.context.symbol,
    percentTp,
    percentSl,
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
  self.params.logger.info(
    "ClientStrategy backtest scheduled signal cancelled",
    {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
      closeTimestamp,
      averagePrice,
      priceStopLoss: scheduled.priceStopLoss,
    }
  );

  await self.setScheduledSignal(null);

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
  scheduled: IScheduledSignalRow,
  activationTimestamp: number
): Promise<boolean> => {
  // Check if strategy was stopped
  if (self._isStopped) {
    self.params.logger.info("ClientStrategy backtest scheduled signal activation cancelled (stopped)", {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
    });
    await self.setScheduledSignal(null);
    return false;
  }

  // В BACKTEST режиме activationTimestamp - это candle.timestamp + 60*1000
  // (timestamp СЛЕДУЮЩЕЙ свечи после достижения priceOpen)
  // Это обеспечивает точный расчёт minuteEstimatedTime от момента активации
  const activationTime = activationTimestamp;

  self.params.logger.info(
    "ClientStrategy backtest scheduled signal activated",
    {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
      priceOpen: scheduled.priceOpen,
      scheduledAt: scheduled.scheduledAt,
      pendingAt: activationTime,
    }
  );

  if (
    await not(
      self.params.risk.checkSignal({
        pendingSignal: scheduled,
        symbol: self.params.execution.context.symbol,
        strategyName: self.params.method.context.strategyName,
        exchangeName: self.params.method.context.exchangeName,
        currentPrice: scheduled.priceOpen,
        timestamp: activationTime,
      })
    )
  ) {
    self.params.logger.info("ClientStrategy backtest scheduled signal rejected by risk", {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
    });
    await self.setScheduledSignal(null);
    return false;
  }

  await self.setScheduledSignal(null);

  // КРИТИЧЕСКИ ВАЖНО: обновляем pendingAt при активации в backtest
  const activatedSignal: ISignalRow = {
    ...scheduled,
    pendingAt: activationTime,
    _isScheduled: false,
  };

  await self.setPendingSignal(activatedSignal);

  await self.params.risk.addSignal(self.params.execution.context.symbol, {
    strategyName: self.params.method.context.strategyName,
    riskName: self.params.riskName,
  });

  if (self.params.callbacks?.onOpen) {
    self.params.callbacks.onOpen(
      self.params.execution.context.symbol,
      activatedSignal,
      activatedSignal.priceOpen,
      self.params.execution.context.backtest
    );
  }

  return true;
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

  // КРИТИЧНО: Очищаем состояние ClientPartial при закрытии позиции
  await self.params.partial.clear(
    self.params.execution.context.symbol,
    signal,
    averagePrice,
    self.params.execution.context.backtest
  );

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
  const candlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;
  const maxTimeToWait = GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES * 60 * 1000;
  const bufferCandlesCount = candlesCount - 1;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // КРИТИЧНО: Пропускаем первые bufferCandlesCount свечей (буфер для VWAP)
    // BacktestLogicPrivateService запросил свечи начиная с (when - bufferMinutes)
    if (i < bufferCandlesCount) {
      continue;
    }

    const recentCandles = candles.slice(Math.max(0, i - (candlesCount - 1)), i + 1);
    const averagePrice = GET_AVG_PRICE_FN(recentCandles);

    // КРИТИЧНО: Проверяем timeout ПЕРЕД проверкой цены
    const elapsedTime = candle.timestamp - scheduled.scheduledAt;
    if (elapsedTime >= maxTimeToWait) {
      const result = await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
        self,
        scheduled,
        averagePrice,
        candle.timestamp
      );
      return { activated: false, cancelled: true, activationIndex: i, result };
    }

    let shouldActivate = false;
    let shouldCancel = false;

    if (scheduled.position === "long") {
      // КРИТИЧНО для LONG:
      // - priceOpen > priceStopLoss (по валидации)
      // - Активация: low <= priceOpen (цена упала до входа)
      // - Отмена: low <= priceStopLoss (цена пробила SL)
      //
      // EDGE CASE: если low <= priceStopLoss И low <= priceOpen на ОДНОЙ свече:
      // => Отмена имеет ПРИОРИТЕТ! (SL пробит ДО или ВМЕСТЕ с активацией)
      // Сигнал НЕ открывается, сразу отменяется

      if (candle.low <= scheduled.priceStopLoss) {
        shouldCancel = true;
      } else if (candle.low <= scheduled.priceOpen) {
        shouldActivate = true;
      }
    }

    if (scheduled.position === "short") {
      // КРИТИЧНО для SHORT:
      // - priceOpen < priceStopLoss (по валидации)
      // - Активация: high >= priceOpen (цена выросла до входа)
      // - Отмена: high >= priceStopLoss (цена пробила SL)
      //
      // EDGE CASE: если high >= priceStopLoss И high >= priceOpen на ОДНОЙ свече:
      // => Отмена имеет ПРИОРИТЕТ! (SL пробит ДО или ВМЕСТЕ с активацией)
      // Сигнал НЕ открывается, сразу отменяется

      if (candle.high >= scheduled.priceStopLoss) {
        shouldCancel = true;
      } else if (candle.high >= scheduled.priceOpen) {
        shouldActivate = true;
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
      await ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN(self, scheduled, candle.timestamp);
      return {
        activated: true,
        cancelled: false,
        activationIndex: i,
        result: null,
      };
    }
  }

  return {
    activated: false,
    cancelled: false,
    activationIndex: -1,
    result: null,
  };
};

const PROCESS_PENDING_SIGNAL_CANDLES_FN = async (
  self: ClientStrategy,
  signal: ISignalRow,
  candles: ICandleData[]
): Promise<IStrategyTickResultClosed | null> => {
  const candlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;
  const bufferCandlesCount = candlesCount - 1;

  // КРИТИЧНО: проверяем TP/SL на КАЖДОЙ свече начиная после буфера
  // Первые bufferCandlesCount свечей - это буфер для VWAP
  for (let i = 0; i < candles.length; i++) {
    const currentCandle = candles[i];
    const currentCandleTimestamp = currentCandle.timestamp;

    // КРИТИЧНО: Пропускаем первые bufferCandlesCount свечей (буфер для VWAP)
    // BacktestLogicPrivateService запросил свечи начиная с (when - bufferMinutes)
    if (i < bufferCandlesCount) {
      continue;
    }

    // Берем последние candlesCount свечей для VWAP (включая буфер)
    const startIndex = Math.max(0, i - (candlesCount - 1));
    const recentCandles = candles.slice(startIndex, i + 1);
    const averagePrice = GET_AVG_PRICE_FN(recentCandles);

    let shouldClose = false;
    let closeReason: "time_expired" | "take_profit" | "stop_loss" | undefined;

    // Check time expiration FIRST (КРИТИЧНО!)
    const signalTime = signal.pendingAt;
    const maxTimeToWait = signal.minuteEstimatedTime * 60 * 1000;
    const elapsedTime = currentCandleTimestamp - signalTime;

    if (elapsedTime >= maxTimeToWait) {
      shouldClose = true;
      closeReason = "time_expired";
    }

    // Check TP/SL only if not expired
    // КРИТИЧНО: используем candle.high/low для точной проверки достижения TP/SL
    if (!shouldClose && signal.position === "long") {
      // Для LONG: TP срабатывает если high >= TP, SL если low <= SL
      if (currentCandle.high >= signal.priceTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
      } else if (currentCandle.low <= signal.priceStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
      }
    }

    if (!shouldClose && signal.position === "short") {
      // Для SHORT: TP срабатывает если low <= TP, SL если high >= SL
      if (currentCandle.low <= signal.priceTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
      } else if (currentCandle.high >= signal.priceStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
      }
    }

    if (shouldClose) {
      // КРИТИЧНО: при закрытии по TP/SL используем точную цену, а не averagePrice
      let closePrice = averagePrice;
      if (closeReason === "take_profit") {
        closePrice = signal.priceTakeProfit;
      } else if (closeReason === "stop_loss") {
        closePrice = signal.priceStopLoss;
      }

      return await CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN(
        self,
        signal,
        closePrice,
        closeReason!,
        currentCandleTimestamp
      );
    }

    // Call onPartialProfit/onPartialLoss callbacks during backtest candle processing
    // Calculate percentage of path to TP/SL
    {
      if (signal.position === "long") {
        // For long: calculate progress towards TP or SL
        const currentDistance = averagePrice - signal.priceOpen;

        if (currentDistance > 0) {
          // Moving towards TP
          const tpDistance = signal.priceTakeProfit - signal.priceOpen;
          const progressPercent = (currentDistance / tpDistance) * 100;

          await self.params.partial.profit(
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            Math.min(progressPercent, 100),
            self.params.execution.context.backtest,
            new Date(currentCandleTimestamp)
          );

          if (self.params.callbacks?.onPartialProfit) {
            self.params.callbacks.onPartialProfit(
              self.params.execution.context.symbol,
              signal,
              averagePrice,
              Math.min(progressPercent, 100),
              self.params.execution.context.backtest
            );
          }
        } else if (currentDistance < 0) {
          // Moving towards SL
          const slDistance = signal.priceOpen - signal.priceStopLoss;
          const progressPercent = (Math.abs(currentDistance) / slDistance) * 100;

          await self.params.partial.loss(
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            Math.min(progressPercent, 100),
            self.params.execution.context.backtest,
            new Date(currentCandleTimestamp)
          );

          if (self.params.callbacks?.onPartialLoss) {
            self.params.callbacks.onPartialLoss(
              self.params.execution.context.symbol,
              signal,
              averagePrice,
              Math.min(progressPercent, 100),
              self.params.execution.context.backtest
            );
          }
        }
      } else if (signal.position === "short") {
        // For short: calculate progress towards TP or SL
        const currentDistance = signal.priceOpen - averagePrice;

        if (currentDistance > 0) {
          // Moving towards TP
          const tpDistance = signal.priceOpen - signal.priceTakeProfit;
          const progressPercent = (currentDistance / tpDistance) * 100;

          await self.params.partial.profit(
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            Math.min(progressPercent, 100),
            self.params.execution.context.backtest,
            new Date(currentCandleTimestamp)
          );

          if (self.params.callbacks?.onPartialProfit) {
            self.params.callbacks.onPartialProfit(
              self.params.execution.context.symbol,
              signal,
              averagePrice,
              Math.min(progressPercent, 100),
              self.params.execution.context.backtest
            );
          }
        }
        
        if (currentDistance < 0) {
          // Moving towards SL
          const slDistance = signal.priceStopLoss - signal.priceOpen;
          const progressPercent = (Math.abs(currentDistance) / slDistance) * 100;

          await self.params.partial.loss(
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            Math.min(progressPercent, 100),
            self.params.execution.context.backtest,
            new Date(currentCandleTimestamp)
          );

          if (self.params.callbacks?.onPartialLoss) {
            self.params.callbacks.onPartialLoss(
              self.params.execution.context.symbol,
              signal,
              averagePrice,
              Math.min(progressPercent, 100),
              self.params.execution.context.backtest
            );
          }
        }
      }
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

    // КРИТИЧНО: Всегда вызываем коллбек onWrite для тестирования persist storage
    // даже в backtest режиме, чтобы тесты могли перехватывать вызовы через mock adapter
    if (this.params.callbacks?.onWrite) {
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        this._pendingSignal,
        this.params.execution.context.backtest
      );
    }

    if (this.params.execution.context.backtest) {
      return;
    }

    await PersistSignalAdapter.writeSignalData(
      this._pendingSignal,
      this.params.execution.context.symbol,
      this.params.strategyName,
    );
  }

  /**
   * Updates scheduled signal and persists to disk in live mode.
   *
   * Centralized method for all scheduled signal state changes.
   * Uses atomic file writes to prevent corruption.
   *
   * @param scheduledSignal - New scheduled signal state (null to clear)
   * @returns Promise that resolves when update is complete
   */
  public async setScheduledSignal(scheduledSignal: IScheduledSignalRow | null) {
    this.params.logger.debug("ClientStrategy setScheduledSignal", {
      scheduledSignal,
    });
    this._scheduledSignal = scheduledSignal;

    if (this.params.execution.context.backtest) {
      return;
    }

    await PersistScheduleAdapter.writeScheduleData(
      this._scheduledSignal,
      this.params.execution.context.symbol,
      this.params.strategyName,
    );
  }

  /**
   * Retrieves the current pending signal.
   * If no signal is pending, returns null. 
   * @returns Promise resolving to the pending signal or null.
   */
  public async getPendingSignal(symbol: string, strategyName: StrategyName): Promise<ISignalRow | null> {
    this.params.logger.debug("ClientStrategy getPendingSignal", {
      symbol,
      strategyName,
    });
    return this._pendingSignal;
  }

  /**
   * Returns the stopped state of the strategy.
   *
   * Indicates whether the strategy has been explicitly stopped and should
   * not continue processing new ticks or signals.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of the strategy
   * @returns Promise resolving to true if strategy is stopped, false otherwise
   */
  public async getStopped(symbol: string, strategyName: StrategyName): Promise<boolean> {
    this.params.logger.debug("ClientStrategy getStopped", {
      symbol,
      strategyName,
    });
    return this._isStopped;
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
  public async tick(symbol: string, strategyName: StrategyName): Promise<IStrategyTickResult> {
    this.params.logger.debug("ClientStrategy tick", {
      symbol,
      strategyName,
    });

    // Получаем текущее время в начале tick для консистентности
    const currentTime = this.params.execution.context.when.getTime();

    // Early return if strategy was stopped
    if (this._isStopped) {
      const currentPrice = await this.params.exchange.getAveragePrice(
        this.params.execution.context.symbol
      );
      return await RETURN_IDLE_FN(this, currentPrice);
    }

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
      const { shouldActivate, shouldCancel } =
        CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN(
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
        const activateResult = await ACTIVATE_SCHEDULED_SIGNAL_FN(this, this._scheduledSignal, currentTime);
        if (activateResult) {
          return activateResult;
        }
        // Risk rejected or stopped - return idle
        return await RETURN_IDLE_FN(this, currentPrice);
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

      if (signal) {
        if (signal._isScheduled === true) {
          await this.setScheduledSignal(signal as IScheduledSignalRow);
          return await OPEN_NEW_SCHEDULED_SIGNAL_FN(
            this,
            this._scheduledSignal!
          );
        }

        await this.setPendingSignal(signal);
      }

      if (this._pendingSignal) {
        const openResult = await OPEN_NEW_PENDING_SIGNAL_FN(this, this._pendingSignal);
        if (openResult) {
          return openResult;
        }
        // Risk rejected - clear pending signal and return idle
        await this.setPendingSignal(null);
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
   * 1. Iterates through ALL candles starting from the first one
   * 2. Checks TP/SL using candle.high/low (immediate detection)
   * 3. VWAP calculated with dynamic window (1 to CC_AVG_PRICE_CANDLES_COUNT candles)
   * 4. Returns closed result (either TP/SL or time_expired)
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
    symbol: string,
    strategyName: StrategyName,
    candles: ICandleData[]
  ): Promise<IStrategyBacktestResult> {
    this.params.logger.debug("ClientStrategy backtest", {
      symbol,
      strategyName,
      contextSymbol: this.params.execution.context.symbol,
      candlesCount: candles.length,
      hasScheduled: !!this._scheduledSignal,
      hasPending: !!this._pendingSignal,
    });

    if (!this.params.execution.context.backtest) {
      throw new Error("ClientStrategy backtest: running in live context");
    }

    if (!this._pendingSignal && !this._scheduledSignal) {
      throw new Error(
        "ClientStrategy backtest: no pending or scheduled signal"
      );
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
          const candlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;
          const recentCandles = candles.slice(
            Math.max(0, activationIndex - (candlesCount - 1)),
            activationIndex + 1
          );
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
        // Check if timeout reached (CC_SCHEDULE_AWAIT_MINUTES from scheduledAt)
        const maxTimeToWait = GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES * 60 * 1000;
        const lastCandleTimestamp = candles[candles.length - 1].timestamp;
        const elapsedTime = lastCandleTimestamp - scheduled.scheduledAt;

        if (elapsedTime < maxTimeToWait) {
          // Timeout NOT reached yet - signal is still active (waiting for price)
          // Return active result to continue monitoring in next backtest() call
          const candlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;
          const lastCandles = candles.slice(-candlesCount);
          const lastPrice = GET_AVG_PRICE_FN(lastCandles);

          this.params.logger.debug(
            "ClientStrategy backtest scheduled signal still waiting (not expired)",
            {
              symbol: this.params.execution.context.symbol,
              signalId: scheduled.id,
              elapsedMinutes: Math.floor(elapsedTime / 60000),
              maxMinutes: GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES,
            }
          );

          // Don't cancel - just return last active state
          // In real backtest flow this won't happen as we process all candles at once,
          // but this is correct behavior if someone calls backtest() with partial data
          const result: IStrategyTickResultActive = {
            action: "active",
            signal: scheduled,
            currentPrice: lastPrice,
            percentSl: 0,
            percentTp: 0,
            strategyName: this.params.method.context.strategyName,
            exchangeName: this.params.method.context.exchangeName,
            symbol: this.params.execution.context.symbol,
          };

          return result as any; // Cast to IStrategyBacktestResult (which includes Active)
        }

        // Timeout reached - cancel the scheduled signal
        const candlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;
        const lastCandles = candles.slice(-candlesCount);
        const lastPrice = GET_AVG_PRICE_FN(lastCandles);

        this.params.logger.info(
          "ClientStrategy backtest scheduled signal cancelled by timeout",
          {
            symbol: this.params.execution.context.symbol,
            signalId: scheduled.id,
            closeTimestamp: lastCandleTimestamp,
            elapsedMinutes: Math.floor(elapsedTime / 60000),
            maxMinutes: GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES,
            reason: "timeout - price never reached priceOpen",
          }
        );

        return await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
          this,
          scheduled,
          lastPrice,
          lastCandleTimestamp
        );
      }
    }

    // Process pending signal
    const signal = this._pendingSignal;

    if (!signal) {
      throw new Error(
        "ClientStrategy backtest: no pending signal after scheduled activation"
      );
    }

    const candlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;
    if (candles.length < candlesCount) {
      this.params.logger.warn(
        `ClientStrategy backtest: Expected at least ${candlesCount} candles for VWAP, got ${candles.length}`
      );
    }

    const closedResult = await PROCESS_PENDING_SIGNAL_CANDLES_FN(
      this,
      signal,
      candles
    );

    if (closedResult) {
      return closedResult;
    }

    const lastCandles = candles.slice(-GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT);
    const lastPrice = GET_AVG_PRICE_FN(lastCandles);
    const closeTimestamp =
      lastCandles[lastCandles.length - 1].timestamp;

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
   * Clears any scheduled signals (not yet activated).
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
  public async stop(symbol: string, strategyName: StrategyName, backtest: boolean): Promise<void> {
    this.params.logger.debug("ClientStrategy stop", {
      symbol,
      strategyName,
      hasPendingSignal: this._pendingSignal !== null,
      hasScheduledSignal: this._scheduledSignal !== null,
      backtest,
    });

    this._isStopped = true;

    // Clear scheduled signal if exists
    if (!this._scheduledSignal) {
      return;
    }

    this._scheduledSignal = null;

    if (backtest) {
      return;
    }

    await PersistScheduleAdapter.writeScheduleData(
      this._scheduledSignal,
      symbol,
      strategyName,
    );
  }
}

export default ClientStrategy;
