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
  ISignalDto,
  IScheduledSignalRow,
  IScheduledSignalCancelRow,
  IPublicSignalRow,
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
  StrategyCancelReason,
} from "../interfaces/Strategy.interface";
import toProfitLossDto from "../helpers/toProfitLossDto";
import { ICandleData } from "../interfaces/Exchange.interface";
import { PersistSignalAdapter, PersistScheduleAdapter } from "../classes/Persist";
import backtest, { ExecutionContextService } from "../lib";
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

/**
 * Converts internal signal to public API format.
 *
 * This function is used AFTER position opens for external callbacks and API.
 * It hides internal implementation details while exposing effective values:
 *
 * - Replaces internal _trailingPriceStopLoss with effective priceStopLoss
 * - Replaces internal _trailingPriceTakeProfit with effective priceTakeProfit
 * - Preserves original stop-loss in originalPriceStopLoss for reference
 * - Preserves original take-profit in originalPriceTakeProfit for reference
 * - Ensures external code never sees private _trailing* fields
 * - Maintains backward compatibility with non-trailing positions
 *
 * Key differences from TO_RISK_SIGNAL (in ClientRisk.ts):
 * - Used AFTER position opens (vs BEFORE for risk validation)
 * - Works only with ISignalRow/IScheduledSignalRow (vs ISignalDto)
 * - No currentPrice fallback needed (priceOpen always present in opened signals)
 * - Returns IPublicSignalRow (vs IRiskSignalRow for risk checks)
 *
 * Use cases:
 * - All strategy callbacks (onOpen, onClose, onActive, etc.)
 * - External API responses (getPendingSignal, getScheduledSignal)
 * - Event emissions and logging
 * - Integration with ClientPartial and ClientRisk
 *
 * @param signal - Internal signal row with optional trailing stop-loss/take-profit
 * @returns Signal in IPublicSignalRow format with effective SL/TP and hidden internals
 *
 * @example
 * ```typescript
 * // Signal without trailing SL/TP
 * const publicSignal = TO_PUBLIC_SIGNAL(signal);
 * // publicSignal.priceStopLoss = signal.priceStopLoss
 * // publicSignal.priceTakeProfit = signal.priceTakeProfit
 * // publicSignal.originalPriceStopLoss = signal.priceStopLoss
 * // publicSignal.originalPriceTakeProfit = signal.priceTakeProfit
 *
 * // Signal with trailing SL/TP
 * const publicSignal = TO_PUBLIC_SIGNAL(signalWithTrailing);
 * // publicSignal.priceStopLoss = signal._trailingPriceStopLoss (effective)
 * // publicSignal.priceTakeProfit = signal._trailingPriceTakeProfit (effective)
 * // publicSignal.originalPriceStopLoss = signal.priceStopLoss (original)
 * // publicSignal.originalPriceTakeProfit = signal.priceTakeProfit (original)
 * // publicSignal._trailingPriceStopLoss = undefined (hidden from external API)
 * // publicSignal._trailingPriceTakeProfit = undefined (hidden from external API)
 * ```
 */
const TO_PUBLIC_SIGNAL = <T extends ISignalRow | IScheduledSignalRow>(signal: T): IPublicSignalRow => {
  const hasTrailingSL = signal._trailingPriceStopLoss !== undefined;
  const hasTrailingTP = signal._trailingPriceTakeProfit !== undefined;
  
  return {
    ...structuredClone(signal) as ISignalRow | IScheduledSignalRow,
    priceStopLoss: hasTrailingSL ? signal._trailingPriceStopLoss : signal.priceStopLoss,
    priceTakeProfit: hasTrailingTP ? signal._trailingPriceTakeProfit : signal.priceTakeProfit,
    originalPriceStopLoss: signal.priceStopLoss,
    originalPriceTakeProfit: signal.priceTakeProfit,
  };
};

const VALIDATE_SIGNAL_FN = (signal: ISignalRow, currentPrice: number, isScheduled: boolean): void => {
  const errors: string[] = [];

  // ПРОВЕРКА ОБЯЗАТЕЛЬНЫХ ПОЛЕЙ ISignalRow
  {
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
  }

  // ЗАЩИТА ОТ NaN/Infinity: currentPrice должна быть конечным числом
  {
    if (typeof currentPrice !== "number") {
      errors.push(
        `currentPrice must be a number type, got ${currentPrice} (${typeof currentPrice})`
      );
    }
    if (!isFinite(currentPrice)) {
      errors.push(
        `currentPrice must be a finite number, got ${currentPrice} (${typeof currentPrice})`
      );
    }
    if (isFinite(currentPrice) && currentPrice <= 0) {
      errors.push(`currentPrice must be positive, got ${currentPrice}`);
    }
  }

  // ЗАЩИТА ОТ NaN/Infinity: все цены должны быть конечными числами
  {
    if (typeof signal.priceOpen !== "number") {
      errors.push(
        `priceOpen must be a number type, got ${signal.priceOpen} (${typeof signal.priceOpen})`
      );
    }
    if (!isFinite(signal.priceOpen)) {
      errors.push(
        `priceOpen must be a finite number, got ${signal.priceOpen} (${typeof signal.priceOpen})`
      );
    }
    if (typeof signal.priceTakeProfit !== "number") {
      errors.push(
        `priceTakeProfit must be a number type, got ${signal.priceTakeProfit} (${typeof signal.priceTakeProfit})`
      );
    }
    if (!isFinite(signal.priceTakeProfit)) {
      errors.push(
        `priceTakeProfit must be a finite number, got ${signal.priceTakeProfit} (${typeof signal.priceTakeProfit})`
      );
    }
    if (typeof signal.priceStopLoss !== "number") {
      errors.push(
        `priceStopLoss must be a number type, got ${signal.priceStopLoss} (${typeof signal.priceStopLoss})`
      );
    }
    if (!isFinite(signal.priceStopLoss)) {
      errors.push(
        `priceStopLoss must be a finite number, got ${signal.priceStopLoss} (${typeof signal.priceStopLoss})`
      );
    }
  }

  // Валидация цен (только если они конечные)
  {
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
  }

  // Валидация для long позиции
  if (signal.position === "long") {
    // Проверка соотношения цен для long
    {
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

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ: проверяем что позиция не закроется сразу после открытия
    {
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
    }

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ scheduled сигналов
    {
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
    }

    // ЗАЩИТА ОТ МИКРО-ПРОФИТА: TakeProfit должен быть достаточно далеко, чтобы покрыть комиссии
    {
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
    }

    // ЗАЩИТА ОТ СЛИШКОМ УЗКОГО STOPLOSS: минимальный буфер для избежания моментального закрытия
    {
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
    }

    // ЗАЩИТА ОТ ЭКСТРЕМАЛЬНОГО STOPLOSS: ограничиваем максимальный убыток
    {
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
  }

  // Валидация для short позиции
  if (signal.position === "short") {
    // Проверка соотношения цен для short
    {
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

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ: проверяем что позиция не закроется сразу после открытия
    {
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
    }

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ scheduled сигналов
    {
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
    }

    // ЗАЩИТА ОТ МИКРО-ПРОФИТА: TakeProfit должен быть достаточно далеко, чтобы покрыть комиссии
    {
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
    }

    // ЗАЩИТА ОТ СЛИШКОМ УЗКОГО STOPLOSS: минимальный буфер для избежания моментального закрытия
    {
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
    }

    // ЗАЩИТА ОТ ЭКСТРЕМАЛЬНОГО STOPLOSS: ограничиваем максимальный убыток
    {
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
  }

  // Валидация временных параметров
  {
    if (typeof signal.minuteEstimatedTime !== "number") {
      errors.push(
        `minuteEstimatedTime must be a number type, got ${signal.minuteEstimatedTime} (${typeof signal.minuteEstimatedTime})`
      );
    }
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
    if (!isFinite(signal.minuteEstimatedTime)) {
      errors.push(
        `minuteEstimatedTime must be a finite number, got ${signal.minuteEstimatedTime}`
      );
    }
  }

  // ЗАЩИТА ОТ ВЕЧНЫХ СИГНАЛОВ: ограничиваем максимальное время жизни сигнала
  {
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
  }

  // Валидация временных меток
  {
    if (typeof signal.scheduledAt !== "number") {
      errors.push(
        `scheduledAt must be a number type, got ${signal.scheduledAt} (${typeof signal.scheduledAt})`
      );
    }
    if (signal.scheduledAt <= 0) {
      errors.push(`scheduledAt must be positive, got ${signal.scheduledAt}`);
    }
    if (typeof signal.pendingAt !== "number") {
      errors.push(
        `pendingAt must be a number type, got ${signal.pendingAt} (${typeof signal.pendingAt})`
      );
    }
    if (signal.pendingAt <= 0) {
      errors.push(`pendingAt must be positive, got ${signal.pendingAt}`);
    }
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
        CALL_RISK_CHECK_SIGNAL_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          currentTime,
          self.params.execution.context.backtest
        )
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
          id: signal.id || randomString(),
          priceOpen: signal.priceOpen, // Используем priceOpen из сигнала
          position: signal.position,
          note: toPlainString(signal.note),
          priceTakeProfit: signal.priceTakeProfit,
          priceStopLoss: signal.priceStopLoss,
          minuteEstimatedTime: signal.minuteEstimatedTime,
          symbol: self.params.execution.context.symbol,
          exchangeName: self.params.method.context.exchangeName,
          strategyName: self.params.method.context.strategyName,
          frameName: self.params.method.context.frameName,
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
        id: signal.id || randomString(),
        priceOpen: signal.priceOpen,
        position: signal.position,
        note: toPlainString(signal.note),
        priceTakeProfit: signal.priceTakeProfit,
        priceStopLoss: signal.priceStopLoss,
        minuteEstimatedTime: signal.minuteEstimatedTime,
        symbol: self.params.execution.context.symbol,
        exchangeName: self.params.method.context.exchangeName,
        strategyName: self.params.method.context.strategyName,
        frameName: self.params.method.context.frameName,
        scheduledAt: currentTime,
        pendingAt: currentTime, // Временно, обновится при активации
        _isScheduled: true,
      };

      // Валидируем сигнал перед возвратом
      VALIDATE_SIGNAL_FN(scheduledSignalRow, currentPrice, true);

      return scheduledSignalRow;
    }

    const signalRow: ISignalRow = {
      id: signal.id || randomString(),
      priceOpen: currentPrice,
      ...structuredClone(signal),
      note: toPlainString(signal.note),
      symbol: self.params.execution.context.symbol,
      exchangeName: self.params.method.context.exchangeName,
      strategyName: self.params.method.context.strategyName,
      frameName: self.params.method.context.frameName,
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
      const message = "ClientStrategy GET_SIGNAL_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
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
    self.params.exchangeName,
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
    const currentPrice = await self.params.exchange.getAveragePrice(
      self.params.execution.context.symbol
    );
    const currentTime = self.params.execution.context.when.getTime();
    await CALL_ACTIVE_CALLBACKS_FN(
      self,
      self.params.execution.context.symbol,
      pendingSignal,
      currentPrice,
      currentTime,
      self.params.execution.context.backtest
    );
  }

  // Restore scheduled signal
  const scheduledSignal = await PersistScheduleAdapter.readScheduleData(
    self.params.execution.context.symbol,
    self.params.strategyName,
    self.params.exchangeName,
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
    const currentPrice = await self.params.exchange.getAveragePrice(
      self.params.execution.context.symbol
    );
    const currentTime = self.params.execution.context.when.getTime();
    await CALL_SCHEDULE_CALLBACKS_FN(
      self,
      self.params.execution.context.symbol,
      scheduledSignal,
      currentPrice,
      currentTime,
      self.params.execution.context.backtest
    );
  }
};

const PARTIAL_PROFIT_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  percentToClose: number,
  currentPrice: number
): void => {
  // Initialize partial array if not present
  if (!signal._partial) signal._partial = [];

  // Calculate current totals (computed values)
  const tpClosed = signal._partial
    .filter((p) => p.type === "profit")
    .reduce((sum, p) => sum + p.percent, 0);
  const slClosed = signal._partial
    .filter((p) => p.type === "loss")
    .reduce((sum, p) => sum + p.percent, 0);
  const totalClosed = tpClosed + slClosed;

  // Check if would exceed 100% total closed
  const newTotalClosed = totalClosed + percentToClose;
  if (newTotalClosed > 100) {
    self.params.logger.warn(
      "PARTIAL_PROFIT_FN: would exceed 100% closed, skipping",
      {
        signalId: signal.id,
        currentTotalClosed: totalClosed,
        percentToClose,
        newTotalClosed,
      }
    );
    return;
  }

  // Add new partial close entry
  signal._partial.push({
    type: "profit",
    percent: percentToClose,
    price: currentPrice,
  });

  self.params.logger.info("PARTIAL_PROFIT_FN executed", {
    signalId: signal.id,
    percentClosed: percentToClose,
    totalClosed: newTotalClosed,
    currentPrice,
    tpClosed: tpClosed + percentToClose,
  });
};

const PARTIAL_LOSS_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  percentToClose: number,
  currentPrice: number
): void => {
  // Initialize partial array if not present
  if (!signal._partial) signal._partial = [];

  // Calculate current totals (computed values)
  const tpClosed = signal._partial
    .filter((p) => p.type === "profit")
    .reduce((sum, p) => sum + p.percent, 0);
  const slClosed = signal._partial
    .filter((p) => p.type === "loss")
    .reduce((sum, p) => sum + p.percent, 0);
  const totalClosed = tpClosed + slClosed;

  // Check if would exceed 100% total closed
  const newTotalClosed = totalClosed + percentToClose;
  if (newTotalClosed > 100) {
    self.params.logger.warn(
      "PARTIAL_LOSS_FN: would exceed 100% closed, skipping",
      {
        signalId: signal.id,
        currentTotalClosed: totalClosed,
        percentToClose,
        newTotalClosed,
      }
    );
    return;
  }

  // Add new partial close entry
  signal._partial.push({
    type: "loss",
    percent: percentToClose,
    price: currentPrice,
  });

  self.params.logger.warn("PARTIAL_LOSS_FN executed", {
    signalId: signal.id,
    percentClosed: percentToClose,
    totalClosed: newTotalClosed,
    currentPrice,
    slClosed: slClosed + percentToClose,
  });
};

const TRAILING_STOP_LOSS_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  percentShift: number
): void => {
  // Get current effective stop-loss (trailing or original)
  const currentStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;

  // Calculate distance between entry and CURRENT stop-loss AS PERCENTAGE of entry price
  const currentSlDistancePercent = Math.abs((signal.priceOpen - currentStopLoss) / signal.priceOpen * 100);

  // Calculate new stop-loss distance percentage by adding shift to CURRENT distance
  // Negative percentShift: reduces distance % (tightens stop, moves SL toward entry or beyond)
  // Positive percentShift: increases distance % (loosens stop, moves SL away from entry)
  const newSlDistancePercent = currentSlDistancePercent + percentShift;

  // Calculate new stop-loss price based on new distance percentage
  // Negative newSlDistancePercent means SL crosses entry into profit zone
  let newStopLoss: number;

  if (signal.position === "long") {
    // LONG: SL is below entry (or above entry if in profit zone)
    // Formula: entry * (1 - newDistance%)
    // Example: entry=100, currentSL=95 (5%), shift=-3% → newDistance=2% → 100 * 0.98 = 98 (tighter)
    newStopLoss = signal.priceOpen * (1 - newSlDistancePercent / 100);
  } else {
    // SHORT: SL is above entry (or below entry if in profit zone)
    // Formula: entry * (1 + newDistance%)
    // Example: entry=100, currentSL=105 (5%), shift=-3% → newDistance=2% → 100 * 1.02 = 102 (tighter)
    newStopLoss = signal.priceOpen * (1 + newSlDistancePercent / 100);
  }

  // Determine if this is the first trailing stop call (direction not set yet)
  const isFirstCall = signal._trailingPriceStopLoss === undefined;

  if (isFirstCall) {
    // First call: set the direction and update SL unconditionally
    signal._trailingPriceStopLoss = newStopLoss;

    self.params.logger.info("TRAILING_STOP_FN executed (first call - direction set)", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      originalStopLoss: signal.priceStopLoss,
      currentDistancePercent: currentSlDistancePercent,
      previousStopLoss: currentStopLoss,
      newStopLoss,
      newDistancePercent: newSlDistancePercent,
      percentShift,
      inProfitZone: signal.position === "long" ? newStopLoss > signal.priceOpen : newStopLoss < signal.priceOpen,
      direction: newStopLoss > currentStopLoss ? "up" : "down",
    });
  } else {
    // Subsequent calls: only update if new SL continues in the same direction
    
    // Determine initial direction: "closer" or "farther" relative to entry
    let initialDirection: "closer" | "farther";
    
    if (signal.position === "long") {
      // LONG: closer = SL closer to entry = higher SL value (moving up)
      initialDirection = signal._trailingPriceStopLoss > signal.priceStopLoss ? "closer" : "farther";
    } else {
      // SHORT: closer = SL closer to entry = lower SL value (moving down)
      initialDirection = signal._trailingPriceStopLoss < signal.priceStopLoss ? "closer" : "farther";
    }
    
    // Determine new direction
    let newDirection: "closer" | "farther";
    
    if (signal.position === "long") {
      // LONG: closer = higher SL value
      newDirection = newStopLoss > currentStopLoss ? "closer" : "farther";
    } else {
      // SHORT: closer = lower SL value
      newDirection = newStopLoss < currentStopLoss ? "closer" : "farther";
    }
    
    // Only allow continuation in same direction
    const shouldUpdate = initialDirection === newDirection;

    if (!shouldUpdate) {
      self.params.logger.debug("TRAILING_STOP_FN: new SL not in same direction, skipping", {
        signalId: signal.id,
        position: signal.position,
        currentStopLoss,
        newStopLoss,
        percentShift,
        initialDirection,
        attemptedDirection: newDirection,
      });
      return;
    }

    // Update trailing stop-loss
    signal._trailingPriceStopLoss = newStopLoss;

    self.params.logger.info("TRAILING_STOP_FN executed", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      originalStopLoss: signal.priceStopLoss,
      currentDistancePercent: currentSlDistancePercent,
      previousStopLoss: currentStopLoss,
      newStopLoss,
      newDistancePercent: newSlDistancePercent,
      percentShift,
      inProfitZone: signal.position === "long" ? newStopLoss > signal.priceOpen : newStopLoss < signal.priceOpen,
      direction: initialDirection,
    });
  }
};

const TRAILING_TAKE_PROFIT_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  percentShift: number
): void => {
  // Get current effective take-profit (trailing or original)
  const currentTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;

  // Calculate distance between entry and CURRENT take-profit AS PERCENTAGE of entry price
  const currentTpDistancePercent = Math.abs((currentTakeProfit - signal.priceOpen) / signal.priceOpen * 100);

  // Calculate new take-profit distance percentage by adding shift to CURRENT distance
  // Negative percentShift: reduces distance % (brings TP closer to entry)
  // Positive percentShift: increases distance % (moves TP further from entry)
  const newTpDistancePercent = currentTpDistancePercent + percentShift;

  // Calculate new take-profit price based on new distance percentage
  let newTakeProfit: number;

  if (signal.position === "long") {
    // LONG: TP is above entry
    // Formula: entry * (1 + newDistance%)
    // Example: entry=100, currentTP=115 (15%), shift=-3% → newDistance=12% → 100 * 1.12 = 112 (closer)
    newTakeProfit = signal.priceOpen * (1 + newTpDistancePercent / 100);
  } else {
    // SHORT: TP is below entry
    // Formula: entry * (1 - newDistance%)
    // Example: entry=100, currentTP=85 (15%), shift=-3% → newDistance=12% → 100 * 0.88 = 88 (closer)
    newTakeProfit = signal.priceOpen * (1 - newTpDistancePercent / 100);
  }

  // Determine if this is the first trailing profit call (direction not set yet)
  const isFirstCall = signal._trailingPriceTakeProfit === undefined;

  if (isFirstCall) {
    // First call: set the direction and update TP unconditionally
    signal._trailingPriceTakeProfit = newTakeProfit;

    self.params.logger.info("TRAILING_PROFIT_FN executed (first call - direction set)", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      originalTakeProfit: signal.priceTakeProfit,
      currentDistancePercent: currentTpDistancePercent,
      previousTakeProfit: currentTakeProfit,
      newTakeProfit,
      newDistancePercent: newTpDistancePercent,
      percentShift,
      direction: newTakeProfit > currentTakeProfit ? "up" : "down",
    });
  } else {
    // Subsequent calls: only update if new TP continues in the same direction
    
    // Determine initial direction: "closer" or "farther" relative to entry
    let initialDirection: "closer" | "farther";
    
    if (signal.position === "long") {
      // LONG: closer = TP closer to entry = lower TP value
      initialDirection = signal._trailingPriceTakeProfit < signal.priceTakeProfit ? "closer" : "farther";
    } else {
      // SHORT: closer = TP closer to entry = higher TP value  
      initialDirection = signal._trailingPriceTakeProfit > signal.priceTakeProfit ? "closer" : "farther";
    }
    
    // Determine new direction
    let newDirection: "closer" | "farther";
    
    if (signal.position === "long") {
      // LONG: closer = lower TP value
      newDirection = newTakeProfit < currentTakeProfit ? "closer" : "farther";
    } else {
      // SHORT: closer = higher TP value
      newDirection = newTakeProfit > currentTakeProfit ? "closer" : "farther";
    }
    
    // Only allow continuation in same direction
    const shouldUpdate = initialDirection === newDirection;

    if (!shouldUpdate) {
      self.params.logger.debug("TRAILING_PROFIT_FN: new TP not in same direction, skipping", {
        signalId: signal.id,
        position: signal.position,
        currentTakeProfit,
        newTakeProfit,
        percentShift,
        initialDirection,
        attemptedDirection: newDirection,
      });
      return;
    }

    // Update trailing take-profit
    signal._trailingPriceTakeProfit = newTakeProfit;

    self.params.logger.info("TRAILING_PROFIT_FN executed", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      originalTakeProfit: signal.priceTakeProfit,
      currentDistancePercent: currentTpDistancePercent,
      previousTakeProfit: currentTakeProfit,
      newTakeProfit,
      newDistancePercent: newTpDistancePercent,
      percentShift,
      direction: initialDirection,
    });
  }
};

const BREAKEVEN_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  currentPrice: number
): boolean => {
  // Calculate breakeven threshold based on slippage and fees
  // Need to cover: entry slippage + entry fee + exit slippage + exit fee
  // Total: (slippage + fee) * 2 transactions
  const breakevenThresholdPercent =
    (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2;

  // Check if trailing stop is already set
  if (signal._trailingPriceStopLoss !== undefined) {
    const trailingStopLoss = signal._trailingPriceStopLoss;
    const breakevenPrice = signal.priceOpen;

    if (signal.position === "long") {
      // LONG: trailing SL is positive if it's above entry (in profit zone)
      const isPositiveTrailing = trailingStopLoss > signal.priceOpen;

      if (isPositiveTrailing) {
        // Trailing stop is already protecting profit - consider breakeven achieved
        self.params.logger.debug("BREAKEVEN_FN: positive trailing stop already set, returning true", {
          signalId: signal.id,
          position: signal.position,
          priceOpen: signal.priceOpen,
          trailingStopLoss,
          breakevenPrice,
          reason: "trailing SL already in profit zone (above entry)",
        });
        return true;
      } else {
        // Trailing stop is negative (below entry)
        // Check if we can upgrade it to breakeven
        const thresholdPrice = signal.priceOpen * (1 + breakevenThresholdPercent / 100);
        const isThresholdReached = currentPrice >= thresholdPrice;

        if (isThresholdReached && breakevenPrice > trailingStopLoss) {
          // Check for price intrusion before setting new SL
          if (currentPrice < breakevenPrice) {
            // Price already crossed the breakeven level - skip setting SL
            self.params.logger.debug("BREAKEVEN_FN: price intrusion detected, skipping SL update", {
              signalId: signal.id,
              position: signal.position,
              priceOpen: signal.priceOpen,
              breakevenPrice,
              currentPrice,
              reason: "currentPrice below breakevenPrice (LONG position)"
            });
            return false;
          }

          // Breakeven is better than current trailing SL - upgrade to breakeven
          signal._trailingPriceStopLoss = breakevenPrice;

          self.params.logger.info("BREAKEVEN_FN: upgraded negative trailing stop to breakeven", {
            signalId: signal.id,
            position: signal.position,
            priceOpen: signal.priceOpen,
            previousTrailingSL: trailingStopLoss,
            newStopLoss: breakevenPrice,
            currentPrice,
            thresholdPrice,
            reason: "breakeven is higher than negative trailing SL",
          });
          return true;
        } else {
          // Cannot upgrade - threshold not reached or breakeven is worse
          self.params.logger.debug("BREAKEVEN_FN: negative trailing stop set, cannot upgrade", {
            signalId: signal.id,
            position: signal.position,
            priceOpen: signal.priceOpen,
            trailingStopLoss,
            breakevenPrice,
            isThresholdReached,
            reason: !isThresholdReached
              ? "threshold not reached"
              : "breakeven not better than current trailing SL",
          });
          return false;
        }
      }
    } else {
      // SHORT: trailing SL is positive if it's below entry (in profit zone)
      const isPositiveTrailing = trailingStopLoss < signal.priceOpen;

      if (isPositiveTrailing) {
        // Trailing stop is already protecting profit - consider breakeven achieved
        self.params.logger.debug("BREAKEVEN_FN: positive trailing stop already set, returning true", {
          signalId: signal.id,
          position: signal.position,
          priceOpen: signal.priceOpen,
          trailingStopLoss,
          breakevenPrice,
          reason: "trailing SL already in profit zone (below entry)",
        });
        return true;
      } else {
        // Trailing stop is negative (above entry)
        // Check if we can upgrade it to breakeven
        const thresholdPrice = signal.priceOpen * (1 - breakevenThresholdPercent / 100);
        const isThresholdReached = currentPrice <= thresholdPrice;

        if (isThresholdReached && breakevenPrice < trailingStopLoss) {
          // Check for price intrusion before setting new SL
          if (currentPrice > breakevenPrice) {
            // Price already crossed the breakeven level - skip setting SL
            self.params.logger.debug("BREAKEVEN_FN: price intrusion detected, skipping SL update", {
              signalId: signal.id,
              position: signal.position,
              priceOpen: signal.priceOpen,
              breakevenPrice,
              currentPrice,
              reason: "currentPrice above breakevenPrice (SHORT position)"
            });
            return false;
          }

          // Breakeven is better than current trailing SL - upgrade to breakeven
          signal._trailingPriceStopLoss = breakevenPrice;

          self.params.logger.info("BREAKEVEN_FN: upgraded negative trailing stop to breakeven", {
            signalId: signal.id,
            position: signal.position,
            priceOpen: signal.priceOpen,
            previousTrailingSL: trailingStopLoss,
            newStopLoss: breakevenPrice,
            currentPrice,
            thresholdPrice,
            reason: "breakeven is lower than negative trailing SL",
          });
          return true;
        } else {
          // Cannot upgrade - threshold not reached or breakeven is worse
          self.params.logger.debug("BREAKEVEN_FN: negative trailing stop set, cannot upgrade", {
            signalId: signal.id,
            position: signal.position,
            priceOpen: signal.priceOpen,
            trailingStopLoss,
            breakevenPrice,
            isThresholdReached,
            reason: !isThresholdReached
              ? "threshold not reached"
              : "breakeven not better than current trailing SL",
          });
          return false;
        }
      }
    }
  }

  // No trailing stop set - proceed with normal breakeven logic
  const currentStopLoss = signal.priceStopLoss;
  const breakevenPrice = signal.priceOpen;

  // Calculate threshold price
  let thresholdPrice: number;
  let isThresholdReached: boolean;
  let canMoveToBreakeven: boolean;

  if (signal.position === "long") {
    // LONG: threshold reached when price goes UP by breakevenThresholdPercent from entry
    thresholdPrice = signal.priceOpen * (1 + breakevenThresholdPercent / 100);
    isThresholdReached = currentPrice >= thresholdPrice;

    // Can move to breakeven only if threshold reached and SL is below entry
    canMoveToBreakeven = isThresholdReached && currentStopLoss < breakevenPrice;
  } else {
    // SHORT: threshold reached when price goes DOWN by breakevenThresholdPercent from entry
    thresholdPrice = signal.priceOpen * (1 - breakevenThresholdPercent / 100);
    isThresholdReached = currentPrice <= thresholdPrice;

    // Can move to breakeven only if threshold reached and SL is above entry
    canMoveToBreakeven = isThresholdReached && currentStopLoss > breakevenPrice;
  }

  if (!canMoveToBreakeven) {
    self.params.logger.debug("BREAKEVEN_FN: conditions not met, skipping", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      currentPrice,
      currentStopLoss,
      breakevenPrice,
      thresholdPrice,
      breakevenThresholdPercent,
      isThresholdReached,
      reason: !isThresholdReached
        ? "threshold not reached"
        : "already at/past breakeven",
    });
    return false;
  }

  // Check for price intrusion before setting new SL
  if (signal.position === "long" && currentPrice < breakevenPrice) {
    // LONG: Price already crossed the breakeven level - skip setting SL
    self.params.logger.debug("BREAKEVEN_FN: price intrusion detected, skipping SL update", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      breakevenPrice,
      currentPrice,
      reason: "currentPrice below breakevenPrice (LONG position)"
    });
    return false;
  }

  if (signal.position === "short" && currentPrice > breakevenPrice) {
    // SHORT: Price already crossed the breakeven level - skip setting SL
    self.params.logger.debug("BREAKEVEN_FN: price intrusion detected, skipping SL update", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      breakevenPrice,
      currentPrice,
      reason: "currentPrice above breakevenPrice (SHORT position)"
    });
    return false;
  }

  // Move SL to breakeven (entry price)
  signal._trailingPriceStopLoss = breakevenPrice;

  self.params.logger.info("BREAKEVEN_FN executed", {
    signalId: signal.id,
    position: signal.position,
    priceOpen: signal.priceOpen,
    originalStopLoss: signal.priceStopLoss,
    previousStopLoss: currentStopLoss,
    newStopLoss: breakevenPrice,
    currentPrice,
    thresholdPrice,
    breakevenThresholdPercent,
    profitDistancePercent: signal.position === "long"
      ? ((currentPrice - signal.priceOpen) / signal.priceOpen * 100)
      : ((signal.priceOpen - currentPrice) / signal.priceOpen * 100),
  });

  return true;
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

  await CALL_CANCEL_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    scheduled,
    currentPrice,
    currentTime,
    self.params.execution.context.backtest
  );

  const result: IStrategyTickResultCancelled = {
    action: "cancelled",
    signal: TO_PUBLIC_SIGNAL(scheduled),
    currentPrice: currentPrice,
    closeTimestamp: currentTime,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    reason: "timeout",
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    currentTime,
    self.params.execution.context.backtest
  );

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
): Promise<IStrategyTickResultCancelled> => {
  self.params.logger.info("ClientStrategy scheduled signal cancelled by StopLoss", {
    symbol: self.params.execution.context.symbol,
    signalId: scheduled.id,
    position: scheduled.position,
    averagePrice: currentPrice,
    priceStopLoss: scheduled.priceStopLoss,
  });

  await self.setScheduledSignal(null);

  const currentTime = self.params.execution.context.when.getTime();

  await CALL_CANCEL_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    scheduled,
    currentPrice,
    currentTime,
    self.params.execution.context.backtest
  );

  const result: IStrategyTickResultCancelled = {
    action: "cancelled",
    signal: TO_PUBLIC_SIGNAL(scheduled),
    currentPrice: currentPrice,
    closeTimestamp: currentTime,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    reason: "price_reject",
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    currentTime,
    self.params.execution.context.backtest
  );

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
      CALL_RISK_CHECK_SIGNAL_FN(
        self,
        self.params.execution.context.symbol,
        scheduled,
        scheduled.priceOpen,
        activationTime,
        self.params.execution.context.backtest
      )
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

  await CALL_RISK_ADD_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    activationTime,
    self.params.execution.context.backtest
  );

  await CALL_OPEN_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    self._pendingSignal,
    self._pendingSignal.priceOpen,
    activationTime,
    self.params.execution.context.backtest
  );

  const result: IStrategyTickResultOpened = {
    action: "opened",
    signal: TO_PUBLIC_SIGNAL(self._pendingSignal),
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    currentPrice: self._pendingSignal.priceOpen,
    backtest: self.params.execution.context.backtest,
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    activationTime,
    self.params.execution.context.backtest
  );

  return result;
};

const CALL_PING_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    scheduled: IScheduledSignalRow,
    timestamp: number,
    backtest: boolean,
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(scheduled);

      // Call system onPing callback first (emits to pingSubject)
      await self.params.onPing(
        self.params.execution.context.symbol,
        self.params.method.context.strategyName,
        self.params.method.context.exchangeName,
        publicSignal,
        self.params.execution.context.backtest,
        timestamp
      );

      // Call user onPing callback only if signal is still active (not cancelled, not activated)
      if (self.params.callbacks?.onPing) {
        await self.params.callbacks.onPing(
          self.params.execution.context.symbol,
          publicSignal,
          new Date(timestamp),
          self.params.execution.context.backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    })
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_PING_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_ACTIVE_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onActive) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal);
        await self.params.callbacks.onActive(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
          self.params.execution.context.backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_ACTIVE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_SCHEDULE_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: IScheduledSignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onSchedule) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal);
        await self.params.callbacks.onSchedule(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
          self.params.execution.context.backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_SCHEDULE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_CANCEL_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: IScheduledSignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onCancel) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal);
        await self.params.callbacks.onCancel(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
          self.params.execution.context.backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_CANCEL_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_OPEN_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    priceOpen: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onOpen) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal);
        await self.params.callbacks.onOpen(
          self.params.execution.context.symbol,
          publicSignal,
          priceOpen,
          self.params.execution.context.backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_OPEN_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_CLOSE_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onClose) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal);
        await self.params.callbacks.onClose(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
          self.params.execution.context.backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_CLOSE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_TICK_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    result: IStrategyTickResult,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onTick) {
        await self.params.callbacks.onTick(
          self.params.execution.context.symbol,
          result,
          self.params.execution.context.backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_TICK_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_IDLE_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onIdle) {
        await self.params.callbacks.onIdle(
          self.params.execution.context.symbol,
          currentPrice,
          self.params.execution.context.backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_IDLE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_RISK_ADD_SIGNAL_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      await self.params.risk.addSignal(symbol, {
        strategyName: self.params.method.context.strategyName,
        riskName: self.params.riskName,
        exchangeName: self.params.method.context.exchangeName,
        frameName: self.params.method.context.frameName,
      });
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_RISK_ADD_SIGNAL_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_RISK_REMOVE_SIGNAL_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      await self.params.risk.removeSignal(symbol, {
        strategyName: self.params.method.context.strategyName,
        riskName: self.params.riskName,
        exchangeName: self.params.method.context.exchangeName,
        frameName: self.params.method.context.frameName,
      });
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_RISK_REMOVE_SIGNAL_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_PARTIAL_CLEAR_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal);
      await self.params.partial.clear(
        symbol,
        publicSignal,
        currentPrice,
        backtest,
      );
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_PARTIAL_CLEAR_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_RISK_CHECK_SIGNAL_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    pendingSignal: ISignalDto | ISignalRow | IScheduledSignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<boolean> => {
    return await ExecutionContextService.runInContext(async () => {
      return await self.params.risk.checkSignal({
        pendingSignal,
        symbol: symbol,
        strategyName: self.params.method.context.strategyName,
        exchangeName: self.params.method.context.exchangeName,
        frameName: self.params.method.context.frameName,
        currentPrice,
        timestamp,
      });
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    defaultValue: false,
    fallback: (error) => {
      const message = "ClientStrategy CALL_RISK_CHECK_SIGNAL_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_PARTIAL_PROFIT_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    percentTp: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal);
      await self.params.partial.profit(
        symbol,
        publicSignal,
        currentPrice,
        percentTp,
        backtest,
        new Date(timestamp),
      );
      if (self.params.callbacks?.onPartialProfit) {
        await self.params.callbacks.onPartialProfit(
          symbol,
          publicSignal,
          currentPrice,
          percentTp,
          backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_PARTIAL_PROFIT_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_PARTIAL_LOSS_CALLBACKS_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    percentSl: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal);
      await self.params.partial.loss(
        symbol,
        publicSignal,
        currentPrice,
        percentSl,
        backtest,
        new Date(timestamp)
      );
      if (self.params.callbacks?.onPartialLoss) {
        await self.params.callbacks.onPartialLoss(
          symbol,
          publicSignal,
          currentPrice,
          percentSl,
          backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_PARTIAL_LOSS_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_BREAKEVEN_CHECK_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal);
      const isBreakeven = await self.params.breakeven.check(
        symbol,
        publicSignal,
        currentPrice,
        backtest,
        new Date(timestamp)
      );
      if (self.params.callbacks?.onBreakeven) {
        isBreakeven && await self.params.callbacks.onBreakeven(
          symbol,
          publicSignal,
          currentPrice,
          backtest
        );
      }
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_BREAKEVEN_CHECK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_BREAKEVEN_CLEAR_FN = trycatch(
  async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal);
      await self.params.breakeven.clear(
        symbol,
        publicSignal,
        currentPrice,
        backtest
      );
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_BREAKEVEN_CLEAR_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const RETURN_SCHEDULED_SIGNAL_ACTIVE_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  currentPrice: number
): Promise<IStrategyTickResultActive> => {
  const currentTime = self.params.execution.context.when.getTime();

  await CALL_PING_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    scheduled,
    currentTime,
    self.params.execution.context.backtest
  );

  const result: IStrategyTickResultActive = {
    action: "active",
    signal: TO_PUBLIC_SIGNAL(scheduled),
    currentPrice: currentPrice,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    percentTp: 0,
    percentSl: 0,
    backtest: self.params.execution.context.backtest,
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    currentTime,
    self.params.execution.context.backtest
  );

  return result;
};

const OPEN_NEW_SCHEDULED_SIGNAL_FN = async (
  self: ClientStrategy,
  signal: IScheduledSignalRow
): Promise<IStrategyTickResultScheduled> => {
  const currentPrice = await self.params.exchange.getAveragePrice(
    self.params.execution.context.symbol
  );

  const currentTime = self.params.execution.context.when.getTime();

  self.params.logger.info("ClientStrategy scheduled signal created", {
    symbol: self.params.execution.context.symbol,
    signalId: signal.id,
    position: signal.position,
    priceOpen: signal.priceOpen,
    currentPrice: currentPrice,
  });

  await CALL_SCHEDULE_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    currentPrice,
    currentTime,
    self.params.execution.context.backtest
  );

  const result: IStrategyTickResultScheduled = {
    action: "scheduled",
    signal: TO_PUBLIC_SIGNAL(signal),
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    currentPrice: currentPrice,
    backtest: self.params.execution.context.backtest,
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    currentTime,
    self.params.execution.context.backtest
  );

  return result;
};

const OPEN_NEW_PENDING_SIGNAL_FN = async (
  self: ClientStrategy,
  signal: ISignalRow
): Promise<IStrategyTickResultOpened | null> => {
  const currentTime = self.params.execution.context.when.getTime();

  if (
    await not(
      CALL_RISK_CHECK_SIGNAL_FN(
        self,
        self.params.execution.context.symbol,
        signal,
        signal.priceOpen,
        currentTime,
        self.params.execution.context.backtest
      )
    )
  ) {
    return null;
  }

  await CALL_RISK_ADD_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    currentTime,
    self.params.execution.context.backtest
  );

  await CALL_OPEN_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    signal.priceOpen,
    currentTime,
    self.params.execution.context.backtest
  );

  const result: IStrategyTickResultOpened = {
    action: "opened",
    signal: TO_PUBLIC_SIGNAL(signal),
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    currentPrice: signal.priceOpen,
    backtest: self.params.execution.context.backtest,
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    currentTime,
    self.params.execution.context.backtest
  );

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

  // Check take profit (use trailing TP if set, otherwise original TP)
  const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;

  if (signal.position === "long" && averagePrice >= effectiveTakeProfit) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      effectiveTakeProfit, // КРИТИЧНО: используем точную цену TP
      "take_profit"
    );
  }

  if (signal.position === "short" && averagePrice <= effectiveTakeProfit) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      effectiveTakeProfit, // КРИТИЧНО: используем точную цену TP
      "take_profit"
    );
  }

  // Check stop loss (use trailing SL if set, otherwise original SL)
  const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;

  if (signal.position === "long" && averagePrice <= effectiveStopLoss) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      effectiveStopLoss, // КРИТИЧНО: используем точную цену SL (trailing or original)
      "stop_loss"
    );
  }

  if (signal.position === "short" && averagePrice >= effectiveStopLoss) {
    return await CLOSE_PENDING_SIGNAL_FN(
      self,
      signal,
      effectiveStopLoss, // КРИТИЧНО: используем точную цену SL (trailing or original)
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

  const currentTime = self.params.execution.context.when.getTime();

  self.params.logger.info(`ClientStrategy signal ${closeReason}`, {
    symbol: self.params.execution.context.symbol,
    signalId: signal.id,
    closeReason,
    priceClose: currentPrice,
    pnlPercentage: pnl.pnlPercentage,
  });

  await CALL_CLOSE_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    currentPrice,
    currentTime,
    self.params.execution.context.backtest
  );

  // КРИТИЧНО: Очищаем состояние ClientPartial при закрытии позиции
  await CALL_PARTIAL_CLEAR_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    currentPrice,
    currentTime,
    self.params.execution.context.backtest
  );

  // КРИТИЧНО: Очищаем состояние ClientBreakeven при закрытии позиции
  await CALL_BREAKEVEN_CLEAR_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    currentPrice,
    currentTime,
    self.params.execution.context.backtest
  );

  await CALL_RISK_REMOVE_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    currentTime,
    self.params.execution.context.backtest
  );

  await self.setPendingSignal(null);

  const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: TO_PUBLIC_SIGNAL(signal),
    currentPrice: currentPrice,
    closeReason: closeReason,
    closeTimestamp: currentTime,
    pnl: pnl,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    currentTime,
    self.params.execution.context.backtest
  );

  return result;
};

const RETURN_PENDING_SIGNAL_ACTIVE_FN = async (
  self: ClientStrategy,
  signal: ISignalRow,
  currentPrice: number
): Promise<IStrategyTickResultActive> => {
  let percentTp = 0;
  let percentSl = 0;

  const currentTime = self.params.execution.context.when.getTime();

  // Calculate percentage of path to TP/SL for partial fill/loss callbacks
  {
    if (signal.position === "long") {
      // For long: calculate progress towards TP or SL
      const currentDistance = currentPrice - signal.priceOpen;

      if (currentDistance > 0) {
        // Check if breakeven should be triggered
        await CALL_BREAKEVEN_CHECK_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          currentTime,
          self.params.execution.context.backtest
        );
      }

      if (currentDistance > 0) {
        // Moving towards TP (use trailing TP if set)
        const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
        const tpDistance = effectiveTakeProfit - signal.priceOpen;
        const progressPercent = (currentDistance / tpDistance) * 100;
        percentTp = Math.min(progressPercent, 100);

        await CALL_PARTIAL_PROFIT_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentTp,
          currentTime,
          self.params.execution.context.backtest
        );
      } else if (currentDistance < 0) {
        // Moving towards SL (use trailing SL if set)
        const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;
        const slDistance = signal.priceOpen - effectiveStopLoss;
        const progressPercent = (Math.abs(currentDistance) / slDistance) * 100;
        percentSl = Math.min(progressPercent, 100);
        await CALL_PARTIAL_LOSS_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentSl,
          currentTime,
          self.params.execution.context.backtest
        );
      }
    } else if (signal.position === "short") {
      // For short: calculate progress towards TP or SL
      const currentDistance = signal.priceOpen - currentPrice;

      if (currentDistance > 0) {
        // Check if breakeven should be triggered
        await CALL_BREAKEVEN_CHECK_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          currentTime,
          self.params.execution.context.backtest
        );
      }

      if (currentDistance > 0) {
        // Moving towards TP (use trailing TP if set)
        const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
        const tpDistance = signal.priceOpen - effectiveTakeProfit;
        const progressPercent = (currentDistance / tpDistance) * 100;
        percentTp = Math.min(progressPercent, 100);
        await CALL_PARTIAL_PROFIT_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentTp,
          currentTime,
          self.params.execution.context.backtest
        );
      }

      if (currentDistance < 0) {
        // Moving towards SL (use trailing SL if set)
        const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;
        const slDistance = effectiveStopLoss - signal.priceOpen;
        const progressPercent = (Math.abs(currentDistance) / slDistance) * 100;
        percentSl = Math.min(progressPercent, 100);
        await CALL_PARTIAL_LOSS_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentSl,
          currentTime,
          self.params.execution.context.backtest
        );
      }
    }
  }

  const result: IStrategyTickResultActive = {
    action: "active",
    signal: TO_PUBLIC_SIGNAL(signal),
    currentPrice: currentPrice,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    percentTp,
    percentSl,
    backtest: self.params.execution.context.backtest,
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    currentTime,
    self.params.execution.context.backtest
  );

  return result;
};

const RETURN_IDLE_FN = async (
  self: ClientStrategy,
  currentPrice: number
): Promise<IStrategyTickResultIdle> => {
  const currentTime = self.params.execution.context.when.getTime();

  await CALL_IDLE_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    currentPrice,
    currentTime,
    self.params.execution.context.backtest
  );

  const result: IStrategyTickResultIdle = {
    action: "idle",
    signal: null,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    currentPrice: currentPrice,
    backtest: self.params.execution.context.backtest,
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    currentTime,
    self.params.execution.context.backtest
  );

  return result;
};

const CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  averagePrice: number,
  closeTimestamp: number,
  reason: StrategyCancelReason
): Promise<IStrategyTickResultCancelled> => {
  self.params.logger.info(
    "ClientStrategy backtest scheduled signal cancelled",
    {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
      closeTimestamp,
      averagePrice,
      priceStopLoss: scheduled.priceStopLoss,
      reason,
    }
  );

  await self.setScheduledSignal(null);

  await CALL_CANCEL_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    scheduled,
    averagePrice,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  const result: IStrategyTickResultCancelled = {
    action: "cancelled",
    signal: TO_PUBLIC_SIGNAL(scheduled),
    currentPrice: averagePrice,
    closeTimestamp: closeTimestamp,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    reason,
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    closeTimestamp,
    self.params.execution.context.backtest
  );

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
      CALL_RISK_CHECK_SIGNAL_FN(
        self,
        self.params.execution.context.symbol,
        scheduled,
        scheduled.priceOpen,
        activationTime,
        self.params.execution.context.backtest
      )
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

  await CALL_RISK_ADD_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    activationTime,
    self.params.execution.context.backtest
  );

  await CALL_OPEN_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    activatedSignal,
    activatedSignal.priceOpen,
    activationTime,
    self.params.execution.context.backtest
  );

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

  await CALL_CLOSE_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    averagePrice,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  // КРИТИЧНО: Очищаем состояние ClientPartial при закрытии позиции
  await CALL_PARTIAL_CLEAR_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    averagePrice,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  // КРИТИЧНО: Очищаем состояние ClientBreakeven при закрытии позиции
  await CALL_BREAKEVEN_CLEAR_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    averagePrice,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  await CALL_RISK_REMOVE_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  await self.setPendingSignal(null);

  const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: TO_PUBLIC_SIGNAL(signal),
    currentPrice: averagePrice,
    closeReason: closeReason,
    closeTimestamp: closeTimestamp,
    pnl: pnl,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
  };

  await CALL_TICK_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    result,
    closeTimestamp,
    self.params.execution.context.backtest
  );

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

    // КРИТИЧНО: Проверяем был ли сигнал отменен пользователем через cancel()
    if (self._cancelledSignal) {
      // Сигнал был отменен через cancel() в onPing
      const result = await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
        self,
        scheduled,
        averagePrice,
        candle.timestamp,
        "user"
      );
      return { activated: false, cancelled: true, activationIndex: i, result };
    }

    // КРИТИЧНО: Проверяем timeout ПЕРЕД проверкой цены
    const elapsedTime = candle.timestamp - scheduled.scheduledAt;
    if (elapsedTime >= maxTimeToWait) {
      const result = await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
        self,
        scheduled,
        averagePrice,
        candle.timestamp,
        "timeout"
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
        candle.timestamp,
        "price_reject"
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

    await CALL_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, scheduled, candle.timestamp, true);
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
    // КРИТИЧНО: используем averagePrice (VWAP) для проверки достижения TP/SL (как в live mode)
    // КРИТИЧНО: используем trailing SL и TP если установлены
    const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;
    const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;

    if (!shouldClose && signal.position === "long") {
      // Для LONG: TP срабатывает если VWAP >= TP, SL если VWAP <= SL
      if (averagePrice >= effectiveTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
      } else if (averagePrice <= effectiveStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
      }
    }

    if (!shouldClose && signal.position === "short") {
      // Для SHORT: TP срабатывает если VWAP <= TP, SL если VWAP >= SL
      if (averagePrice <= effectiveTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
      } else if (averagePrice >= effectiveStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
      }
    }

    if (shouldClose) {
      // КРИТИЧНО: используем точную цену TP/SL для закрытия (как в live mode)
      let closePrice: number;
      if (closeReason === "take_profit") {
        closePrice = effectiveTakeProfit; // используем trailing TP если установлен
      } else if (closeReason === "stop_loss") {
        closePrice = effectiveStopLoss;
      } else {
        closePrice = averagePrice; // time_expired uses VWAP
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
          // Check if breakeven should be triggered
          await CALL_BREAKEVEN_CHECK_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
        }

        if (currentDistance > 0) {
          // Moving towards TP (use trailing TP if set)
          const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
          const tpDistance = effectiveTakeProfit - signal.priceOpen;
          const progressPercent = (currentDistance / tpDistance) * 100;
          await CALL_PARTIAL_PROFIT_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            Math.min(progressPercent, 100),
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
        } else if (currentDistance < 0) {
          // Moving towards SL (use trailing SL if set)
          const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;
          const slDistance = signal.priceOpen - effectiveStopLoss;
          const progressPercent = (Math.abs(currentDistance) / slDistance) * 100;
          await CALL_PARTIAL_LOSS_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            Math.min(progressPercent, 100),
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
        }
      } else if (signal.position === "short") {
        // For short: calculate progress towards TP or SL
        const currentDistance = signal.priceOpen - averagePrice;

        if (currentDistance > 0) {
          // Check if breakeven should be triggered
          await CALL_BREAKEVEN_CHECK_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
        }

        if (currentDistance > 0) {
          // Moving towards TP (use trailing TP if set)
          const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
          const tpDistance = signal.priceOpen - effectiveTakeProfit;
          const progressPercent = (currentDistance / tpDistance) * 100;

          await CALL_PARTIAL_PROFIT_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            Math.min(progressPercent, 100),
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
        }

        if (currentDistance < 0) {
          // Moving towards SL (use trailing SL if set)
          const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;
          const slDistance = effectiveStopLoss - signal.priceOpen;
          const progressPercent = (Math.abs(currentDistance) / slDistance) * 100;
          await CALL_PARTIAL_LOSS_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            Math.min(progressPercent, 100),
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
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
  _lastSignalTimestamp: number | null = null;

  _scheduledSignal: IScheduledSignalRow | null = null;
  _cancelledSignal: IScheduledSignalCancelRow | null = null;

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
      const publicSignal = this._pendingSignal ? TO_PUBLIC_SIGNAL(this._pendingSignal) : null;
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        publicSignal,
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
      this.params.exchangeName,
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
      this.params.exchangeName,
    );
  }

  /**
   * Retrieves the current pending signal.
   * If no signal is pending, returns null.
   * @returns Promise resolving to the pending signal or null.
   */
  public async getPendingSignal(symbol: string): Promise<IPublicSignalRow | null> {
    this.params.logger.debug("ClientStrategy getPendingSignal", {
      symbol,
    });
    return this._pendingSignal ? TO_PUBLIC_SIGNAL(this._pendingSignal) : null;
  }

  /**
   * Retrieves the current scheduled signal.
   * If no scheduled signal exists, returns null.
   * @returns Promise resolving to the scheduled signal or null.
   */
  public async getScheduledSignal(symbol: string): Promise<IPublicSignalRow | null> {
    this.params.logger.debug("ClientStrategy getScheduledSignal", {
      symbol,
    });
    return this._scheduledSignal ? TO_PUBLIC_SIGNAL(this._scheduledSignal) : null;
  }

  /**
   * Checks if breakeven threshold has been reached for the current pending signal.
   *
   * Uses the same formula as BREAKEVEN_FN to determine if price has moved far enough
   * to cover transaction costs (slippage + fees) and allow breakeven to be set.
   * Threshold: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2 transactions
   *
   * For LONG position:
   * - Returns true when: currentPrice >= priceOpen * (1 + threshold%)
   * - Example: entry=100, threshold=0.4% → true when price >= 100.4
   *
   * For SHORT position:
   * - Returns true when: currentPrice <= priceOpen * (1 - threshold%)
   * - Example: entry=100, threshold=0.4% → true when price <= 99.6
   *
   * Special cases:
   * - Returns false if no pending signal exists
   * - Returns true if trailing stop is already in profit zone (breakeven already achieved)
   * - Returns false if threshold not reached yet
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - Current market price to check against threshold
   * @returns Promise<boolean> - true if breakeven threshold reached, false otherwise
   *
   * @example
   * ```typescript
   * // Check if breakeven is available for LONG position (entry=100, threshold=0.4%)
   * const canBreakeven = await strategy.getBreakeven("BTCUSDT", 100.5);
   * // Returns true (price >= 100.4)
   *
   * if (canBreakeven) {
   *   await strategy.breakeven("BTCUSDT", 100.5, false);
   * }
   * ```
   */
  public async getBreakeven(symbol: string, currentPrice: number): Promise<boolean> {
    this.params.logger.debug("ClientStrategy getBreakeven", {
      symbol,
      currentPrice,
    });

    // No pending signal - breakeven not available
    if (!this._pendingSignal) {
      return false;
    }

    const signal = this._pendingSignal;

    // Calculate breakeven threshold based on slippage and fees
    // Need to cover: entry slippage + entry fee + exit slippage + exit fee
    // Total: (slippage + fee) * 2 transactions
    const breakevenThresholdPercent =
      (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2 + GLOBAL_CONFIG.CC_BREAKEVEN_THRESHOLD;

    // Check if trailing stop is already set
    if (signal._trailingPriceStopLoss !== undefined) {
      const trailingStopLoss = signal._trailingPriceStopLoss;

      if (signal.position === "long") {
        // LONG: trailing SL is positive if it's above entry (in profit zone)
        const isPositiveTrailing = trailingStopLoss > signal.priceOpen;

        if (isPositiveTrailing) {
          // Trailing stop is already protecting profit - breakeven achieved
          return true;
        }

        // Trailing stop is negative (below entry)
        // Check if we can upgrade it to breakeven
        const thresholdPrice = signal.priceOpen * (1 + breakevenThresholdPercent / 100);
        const isThresholdReached = currentPrice >= thresholdPrice;
        const breakevenPrice = signal.priceOpen;

        // Can upgrade to breakeven if threshold reached and breakeven is better than current trailing SL
        return isThresholdReached && breakevenPrice > trailingStopLoss;
      } else {
        // SHORT: trailing SL is positive if it's below entry (in profit zone)
        const isPositiveTrailing = trailingStopLoss < signal.priceOpen;

        if (isPositiveTrailing) {
          // Trailing stop is already protecting profit - breakeven achieved
          return true;
        }

        // Trailing stop is negative (above entry)
        // Check if we can upgrade it to breakeven
        const thresholdPrice = signal.priceOpen * (1 - breakevenThresholdPercent / 100);
        const isThresholdReached = currentPrice <= thresholdPrice;
        const breakevenPrice = signal.priceOpen;

        // Can upgrade to breakeven if threshold reached and breakeven is better than current trailing SL
        return isThresholdReached && breakevenPrice < trailingStopLoss;
      }
    }

    // No trailing stop set - proceed with normal breakeven logic
    const currentStopLoss = signal.priceStopLoss;
    const breakevenPrice = signal.priceOpen;

    // Calculate threshold price
    let thresholdPrice: number;
    let isThresholdReached: boolean;
    let canMoveToBreakeven: boolean;

    if (signal.position === "long") {
      // LONG: threshold reached when price goes UP by breakevenThresholdPercent from entry
      thresholdPrice = signal.priceOpen * (1 + breakevenThresholdPercent / 100);
      isThresholdReached = currentPrice >= thresholdPrice;

      // Can move to breakeven only if threshold reached and SL is below entry
      canMoveToBreakeven = isThresholdReached && currentStopLoss < breakevenPrice;
    } else {
      // SHORT: threshold reached when price goes DOWN by breakevenThresholdPercent from entry
      thresholdPrice = signal.priceOpen * (1 - breakevenThresholdPercent / 100);
      isThresholdReached = currentPrice <= thresholdPrice;

      // Can move to breakeven only if threshold reached and SL is above entry
      canMoveToBreakeven = isThresholdReached && currentStopLoss > breakevenPrice;
    }

    return canMoveToBreakeven;
  }

  /**
   * Returns the stopped state of the strategy.
   *
   * Indicates whether the strategy has been explicitly stopped and should
   * not continue processing new ticks or signals.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to true if strategy is stopped, false otherwise
   */
  public async getStopped(symbol: string): Promise<boolean> {
    this.params.logger.debug("ClientStrategy getStopped", {
      symbol,
      strategyName: this.params.method.context.strategyName,
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

    // Check if scheduled signal was cancelled - emit cancelled event once
    if (this._cancelledSignal) {
      const currentPrice = await this.params.exchange.getAveragePrice(
        this.params.execution.context.symbol
      );

      const cancelledSignal = this._cancelledSignal;
      this._cancelledSignal = null; // Clear after emitting

      this.params.logger.info("ClientStrategy tick: scheduled signal was cancelled", {
        symbol: this.params.execution.context.symbol,
        signalId: cancelledSignal.id,
      });

      // Call onCancel callback
      await CALL_CANCEL_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        cancelledSignal,
        currentPrice,
        currentTime,
        this.params.execution.context.backtest
      );

      const result: IStrategyTickResultCancelled = {
        action: "cancelled",
        signal: TO_PUBLIC_SIGNAL(cancelledSignal),
        currentPrice,
        closeTimestamp: currentTime,
        strategyName: this.params.method.context.strategyName,
        exchangeName: this.params.method.context.exchangeName,
        frameName: this.params.method.context.frameName,
        symbol: this.params.execution.context.symbol,
        backtest: this.params.execution.context.backtest,
        reason: "user",
        cancelId: cancelledSignal.cancelId,
      };

      return result;
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

    // If signal was cancelled - return cancelled
    if (this._cancelledSignal) {
      this.params.logger.debug("ClientStrategy backtest: no signal (cancelled or not created)");

      const currentPrice = await this.params.exchange.getAveragePrice(symbol);

      const cancelledSignal = this._cancelledSignal;
      this._cancelledSignal = null; // Clear after using

      const closeTimestamp = this.params.execution.context.when.getTime();

      await CALL_CANCEL_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        cancelledSignal,
        currentPrice,
        closeTimestamp,
        this.params.execution.context.backtest
      );

      const cancelledResult: IStrategyTickResultCancelled = {
        action: "cancelled",
        signal: TO_PUBLIC_SIGNAL(cancelledSignal),
        currentPrice,
        closeTimestamp: closeTimestamp,
        strategyName: this.params.method.context.strategyName,
        exchangeName: this.params.method.context.exchangeName,
        frameName: this.params.method.context.frameName,
        symbol: this.params.execution.context.symbol,
        backtest: true,
        reason: "user",
        cancelId: cancelledSignal.cancelId,
      };

      return cancelledResult;
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
            signal: TO_PUBLIC_SIGNAL(scheduled),
            currentPrice: lastPrice,
            percentSl: 0,
            percentTp: 0,
            strategyName: this.params.method.context.strategyName,
            exchangeName: this.params.method.context.exchangeName,
            frameName: this.params.method.context.frameName,
            symbol: this.params.execution.context.symbol,
            backtest: this.params.execution.context.backtest,
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
          lastCandleTimestamp,
          "timeout"
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
  public async stop(symbol: string, backtest: boolean): Promise<void> {
    this.params.logger.debug("ClientStrategy stop", {
      symbol,
      hasPendingSignal: this._pendingSignal !== null,
      hasScheduledSignal: this._scheduledSignal !== null,
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
      this.params.method.context.strategyName,
      this.params.method.context.exchangeName,
    );
  }

  /**
   * Cancels the scheduled signal without stopping the strategy.
   *
   * Clears the scheduled signal (waiting for priceOpen activation).
   * Does NOT affect active pending signals or strategy operation.
   * Does NOT set stop flag - strategy can continue generating new signals.
   *
   * Use case: Cancel a scheduled entry that is no longer desired without stopping the entire strategy.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Name of the strategy
   * @param backtest - Whether running in backtest mode
   * @returns Promise that resolves when scheduled signal is cleared
   *
   * @example
   * ```typescript
   * // Cancel scheduled signal without stopping strategy
   * await strategy.cancel("BTCUSDT", "my-strategy", false);
   * // Strategy continues, can generate new signals
   * ```
   */
  public async cancel(symbol: string, backtest: boolean, cancelId?: string): Promise<void> {
    this.params.logger.debug("ClientStrategy cancel", {
      symbol,
      hasScheduledSignal: this._scheduledSignal !== null,
      cancelId,
    });

    // Save cancelled signal for next tick to emit cancelled event
    if (this._scheduledSignal) {
      this._cancelledSignal = Object.assign({}, this._scheduledSignal, {
        cancelId,
      });
      this._scheduledSignal = null;
    }

    if (backtest) {
      return;
    }

    await PersistScheduleAdapter.writeScheduleData(
      this._scheduledSignal,
      symbol,
      this.params.method.context.strategyName,
      this.params.method.context.exchangeName,
    );
  }

  /**
   * Executes partial close at profit level (moving toward TP).
   *
   * Closes a percentage of the pending position at the current price, recording it as a "profit" type partial.
   * The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.
   *
   * Behavior:
   * - Adds entry to signal's `_partial` array with type "profit"
   * - Validates percentToClose is in range (0, 100]
   * - Silently skips if total closed would exceed 100%
   * - Persists updated signal state (backtest and live modes)
   * - Calls onWrite callback for persistence testing
   *
   * Validation:
   * - Throws if no pending signal exists
   * - Throws if percentToClose is not a finite number
   * - Throws if percentToClose <= 0 or > 100
   * - Throws if currentPrice is not a positive finite number
   * - Throws if currentPrice is not moving toward TP:
   *   - LONG: currentPrice must be > priceOpen
   *   - SHORT: currentPrice must be < priceOpen
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Percentage of position to close (0-100, absolute value)
   * @param currentPrice - Current market price for this partial close (must be in profit direction)
   * @param backtest - Whether running in backtest mode (controls persistence)
   * @returns Promise that resolves when state is updated and persisted
   *
   * @example
   * ```typescript
   * // Close 30% of position at profit (moving toward TP)
   * await strategy.partialProfit("BTCUSDT", 30, 45000, false);
   *
   * // Later close another 20%
   * await strategy.partialProfit("BTCUSDT", 20, 46000, false);
   *
   * // Final close will calculate weighted PNL from all partials
   * ```
   */
  public async partialProfit(
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    backtest: boolean
  ): Promise<void> {
    this.params.logger.debug("ClientStrategy partialProfit", {
      symbol,
      percentToClose,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });

    // Validation: must have pending signal
    if (!this._pendingSignal) {
      throw new Error(
        `ClientStrategy partialProfit: No pending signal exists for symbol=${symbol}`
      );
    }

    // Validation: percentToClose must be valid
    if (typeof percentToClose !== "number" || !isFinite(percentToClose)) {
      throw new Error(
        `ClientStrategy partialProfit: percentToClose must be a finite number, got ${percentToClose} (${typeof percentToClose})`
      );
    }

    if (percentToClose <= 0) {
      throw new Error(
        `ClientStrategy partialProfit: percentToClose must be > 0, got ${percentToClose}`
      );
    }

    if (percentToClose > 100) {
      throw new Error(
        `ClientStrategy partialProfit: percentToClose must be <= 100, got ${percentToClose}`
      );
    }

    // Validation: currentPrice must be valid
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `ClientStrategy partialProfit: currentPrice must be a positive finite number, got ${currentPrice}`
      );
    }

    // Validation: currentPrice must be moving toward TP (profit direction)
    if (this._pendingSignal.position === "long") {
      // For LONG: currentPrice must be higher than priceOpen (moving toward TP)
      if (currentPrice <= this._pendingSignal.priceOpen) {
        throw new Error(
          `ClientStrategy partialProfit: For LONG position, currentPrice (${currentPrice}) must be > priceOpen (${this._pendingSignal.priceOpen})`
        );
      }
    } else {
      // For SHORT: currentPrice must be lower than priceOpen (moving toward TP)
      if (currentPrice >= this._pendingSignal.priceOpen) {
        throw new Error(
          `ClientStrategy partialProfit: For SHORT position, currentPrice (${currentPrice}) must be < priceOpen (${this._pendingSignal.priceOpen})`
        );
      }
    }

    // Execute partial close logic
    PARTIAL_PROFIT_FN(this, this._pendingSignal, percentToClose, currentPrice);

    // Persist updated signal state (inline setPendingSignal content)
    // Note: this._pendingSignal already mutated by PARTIAL_PROFIT_FN, no reassignment needed
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        TO_PUBLIC_SIGNAL(this._pendingSignal),
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.execution.context.symbol,
        this.params.strategyName,
        this.params.exchangeName,
      );
    }
  }

  /**
   * Executes partial close at loss level (moving toward SL).
   *
   * Closes a percentage of the pending position at the current price, recording it as a "loss" type partial.
   * The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.
   *
   * Behavior:
   * - Adds entry to signal's `_partial` array with type "loss"
   * - Validates percentToClose is in range (0, 100]
   * - Silently skips if total closed would exceed 100%
   * - Persists updated signal state (backtest and live modes)
   * - Calls onWrite callback for persistence testing
   *
   * Validation:
   * - Throws if no pending signal exists
   * - Throws if percentToClose is not a finite number
   * - Throws if percentToClose <= 0 or > 100
   * - Throws if currentPrice is not a positive finite number
   * - Throws if currentPrice is not moving toward SL:
   *   - LONG: currentPrice must be < priceOpen
   *   - SHORT: currentPrice must be > priceOpen
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Percentage of position to close (0-100, absolute value)
   * @param currentPrice - Current market price for this partial close (must be in loss direction)
   * @param backtest - Whether running in backtest mode (controls persistence)
   * @returns Promise that resolves when state is updated and persisted
   *
   * @example
   * ```typescript
   * // Close 40% of position at loss (moving toward SL)
   * await strategy.partialLoss("BTCUSDT", 40, 38000, false);
   *
   * // Later close another 30%
   * await strategy.partialLoss("BTCUSDT", 30, 37000, false);
   *
   * // Final close will calculate weighted PNL from all partials
   * ```
   */
  public async partialLoss(
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    backtest: boolean
  ): Promise<void> {
    this.params.logger.debug("ClientStrategy partialLoss", {
      symbol,
      percentToClose,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });

    // Validation: must have pending signal
    if (!this._pendingSignal) {
      throw new Error(
        `ClientStrategy partialLoss: No pending signal exists for symbol=${symbol}`
      );
    }

    // Validation: percentToClose must be valid
    if (typeof percentToClose !== "number" || !isFinite(percentToClose)) {
      throw new Error(
        `ClientStrategy partialLoss: percentToClose must be a finite number, got ${percentToClose} (${typeof percentToClose})`
      );
    }

    if (percentToClose <= 0) {
      throw new Error(
        `ClientStrategy partialLoss: percentToClose must be > 0, got ${percentToClose}`
      );
    }

    if (percentToClose > 100) {
      throw new Error(
        `ClientStrategy partialLoss: percentToClose must be <= 100, got ${percentToClose}`
      );
    }

    // Validation: currentPrice must be valid
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `ClientStrategy partialLoss: currentPrice must be a positive finite number, got ${currentPrice}`
      );
    }

    // Validation: currentPrice must be moving toward SL (loss direction)
    if (this._pendingSignal.position === "long") {
      // For LONG: currentPrice must be lower than priceOpen (moving toward SL)
      if (currentPrice >= this._pendingSignal.priceOpen) {
        throw new Error(
          `ClientStrategy partialLoss: For LONG position, currentPrice (${currentPrice}) must be < priceOpen (${this._pendingSignal.priceOpen})`
        );
      }
    } else {
      // For SHORT: currentPrice must be higher than priceOpen (moving toward SL)
      if (currentPrice <= this._pendingSignal.priceOpen) {
        throw new Error(
          `ClientStrategy partialLoss: For SHORT position, currentPrice (${currentPrice}) must be > priceOpen (${this._pendingSignal.priceOpen})`
        );
      }
    }

    // Execute partial close logic
    PARTIAL_LOSS_FN(this, this._pendingSignal, percentToClose, currentPrice);

    // Persist updated signal state (inline setPendingSignal content)
    // Note: this._pendingSignal already mutated by PARTIAL_LOSS_FN, no reassignment needed
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        TO_PUBLIC_SIGNAL(this._pendingSignal),
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.execution.context.symbol,
        this.params.strategyName,
        this.params.exchangeName,
      );
    }
  }

  /**
   * Moves stop-loss to breakeven (entry price) when price reaches threshold.
   *
   * Moves SL to entry price (zero-risk position) when current price has moved
   * far enough in profit direction to cover transaction costs (slippage + fees).
   * Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2
   *
   * Behavior:
   * - Returns true if SL was moved to breakeven
   * - Returns false if conditions not met (threshold not reached or already at breakeven)
   * - Uses _trailingPriceStopLoss to store breakeven SL (preserves original priceStopLoss)
   * - Only moves SL once per position (idempotent - safe to call multiple times)
   *
   * For LONG position (entry=100, slippage=0.1%, fee=0.1%):
   * - Threshold: (0.1 + 0.1) * 2 = 0.4%
   * - Breakeven available when price >= 100.4 (entry + 0.4%)
   * - Moves SL from original (e.g. 95) to 100 (breakeven)
   * - Returns true on first successful move, false on subsequent calls
   *
   * For SHORT position (entry=100, slippage=0.1%, fee=0.1%):
   * - Threshold: (0.1 + 0.1) * 2 = 0.4%
   * - Breakeven available when price <= 99.6 (entry - 0.4%)
   * - Moves SL from original (e.g. 105) to 100 (breakeven)
   * - Returns true on first successful move, false on subsequent calls
   *
   * Validation:
   * - Throws if no pending signal exists
   * - Throws if currentPrice is not a positive finite number
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - Current market price to check threshold
   * @param backtest - Whether running in backtest mode (controls persistence)
   * @returns Promise<boolean> - true if breakeven was set, false if conditions not met
   *
   * @example
   * ```typescript
   * // LONG position: entry=100, currentSL=95, threshold=0.4%
   *
   * // Price at 100.3 - threshold not reached yet
   * const result1 = await strategy.breakeven("BTCUSDT", 100.3, false);
   * // Returns false (price < 100.4)
   *
   * // Price at 100.5 - threshold reached!
   * const result2 = await strategy.breakeven("BTCUSDT", 100.5, false);
   * // Returns true, SL moved to 100 (breakeven)
   *
   * // Price at 101 - already at breakeven
   * const result3 = await strategy.breakeven("BTCUSDT", 101, false);
   * // Returns false (already at breakeven, no change)
   * ```
   */
  public async breakeven(
    symbol: string,
    currentPrice: number,
    backtest: boolean
  ): Promise<boolean> {
    this.params.logger.debug("ClientStrategy breakeven", {
      symbol,
      currentPrice,
      breakevenThresholdPercent: (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2,
      hasPendingSignal: this._pendingSignal !== null,
    });

    // Validation: must have pending signal
    if (!this._pendingSignal) {
      throw new Error(
        `ClientStrategy breakeven: No pending signal exists for symbol=${symbol}`
      );
    }

    // Validation: currentPrice must be valid
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `ClientStrategy breakeven: currentPrice must be a positive finite number, got ${currentPrice}`
      );
    }

    // Execute breakeven logic
    const result = BREAKEVEN_FN(this, this._pendingSignal, currentPrice);

    // Only persist if breakeven was actually set
    if (!result) {
      return false;
    }

    // Persist updated signal state (inline setPendingSignal content)
    // Note: this._pendingSignal already mutated by BREAKEVEN_FN, no reassignment needed
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      const publicSignal = TO_PUBLIC_SIGNAL(this._pendingSignal);
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        publicSignal,
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.execution.context.symbol,
        this.params.strategyName,
        this.params.exchangeName,
      );
    }

    return true;
  }

  /**
   * Adjusts trailing stop-loss by shifting distance between entry and original SL.
   *
   * Calculates new SL based on percentage shift of the distance (entry - originalSL):
   * - Negative %: tightens stop (moves SL closer to entry, reduces risk)
   * - Positive %: loosens stop (moves SL away from entry, allows more drawdown)
   *
   * For LONG position (entry=100, originalSL=90, distance=10):
   * - percentShift = -50: newSL = 100 - 10*(1-0.5) = 95 (tighter, closer to entry)
   * - percentShift = +20: newSL = 100 - 10*(1+0.2) = 88 (looser, away from entry)
   *
   * For SHORT position (entry=100, originalSL=110, distance=10):
   * - percentShift = -50: newSL = 100 + 10*(1-0.5) = 105 (tighter, closer to entry)
   * - percentShift = +20: newSL = 100 + 10*(1+0.2) = 112 (looser, away from entry)
   *
   * Trailing behavior:
   * - Only updates if new SL is BETTER (protects more profit)
   * - For LONG: only accepts higher SL (never moves down)
   * - For SHORT: only accepts lower SL (never moves up)
   * - Validates that SL never crosses entry price
   * - Stores in _trailingPriceStopLoss, original priceStopLoss preserved
   *
   * Validation:
   * - Throws if no pending signal exists
   * - Throws if percentShift is not a finite number
   * - Throws if percentShift < -100 or > 100
   * - Throws if percentShift === 0
   * - Throws if currentPrice is not a positive finite number
   * - Skips if new SL would cross entry price
   * - Skips if currentPrice already crossed new SL level (price intrusion protection)
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentShift - Percentage shift of SL distance [-100, 100], excluding 0
   * @param currentPrice - Current market price to check for intrusion
   * @param backtest - Whether running in backtest mode (controls persistence)
   * @returns Promise that resolves when trailing SL is updated and persisted
   *
   * @example
   * ```typescript
   * // LONG position: entry=100, originalSL=90, distance=10%, currentPrice=102
   *
   * // Move SL 50% closer to entry (tighten): reduces distance by 50%
   * await strategy.trailingStop("BTCUSDT", -50, 102, false);
   * // newDistance = 10% - 50% = 5%, newSL = 100 * (1 - 0.05) = 95
   *
   * // Move SL 30% away from entry (loosen): increases distance by 30%  
   * await strategy.trailingStop("BTCUSDT", 30, 102, false);
   * // newDistance = 10% + 30% = 40%, newSL = 100 * (1 - 0.4) = 60
   * 
   * // Price intrusion example: currentPrice=92, trying to set SL=95
   * await strategy.trailingStop("BTCUSDT", -50, 92, false);
   * // SKIPPED: currentPrice (92) < newSL (95) - would trigger immediate stop
   * ```
   */
  public async trailingStop(
    symbol: string,
    percentShift: number,
    currentPrice: number,
    backtest: boolean
  ): Promise<void> {
    this.params.logger.debug("ClientStrategy trailingStop", {
      symbol,
      percentShift,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });

    // Validation: must have pending signal
    if (!this._pendingSignal) {
      throw new Error(
        `ClientStrategy trailingStop: No pending signal exists for symbol=${symbol}`
      );
    }

    // Validation: percentShift must be valid
    if (typeof percentShift !== "number" || !isFinite(percentShift)) {
      throw new Error(
        `ClientStrategy trailingStop: percentShift must be a finite number, got ${percentShift} (${typeof percentShift})`
      );
    }

    if (percentShift < -100 || percentShift > 100) {
      throw new Error(
        `ClientStrategy trailingStop: percentShift must be in range [-100, 100], got ${percentShift}`
      );
    }

    if (percentShift === 0) {
      throw new Error(
        `ClientStrategy trailingStop: percentShift cannot be 0`
      );
    }

    // Validation: currentPrice must be valid
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `ClientStrategy trailingStop: currentPrice must be a positive finite number, got ${currentPrice}`
      );
    }

    // Calculate what the new stop loss would be
    const signal = this._pendingSignal;
    const slDistancePercent = Math.abs((signal.priceOpen - signal.priceStopLoss) / signal.priceOpen * 100);
    const newSlDistancePercent = slDistancePercent + percentShift;
    
    let newStopLoss: number;
    if (signal.position === "long") {
      newStopLoss = signal.priceOpen * (1 - newSlDistancePercent / 100);
    } else {
      newStopLoss = signal.priceOpen * (1 + newSlDistancePercent / 100);
    }

    // Check for price intrusion before executing trailing logic
    if (signal.position === "long" && currentPrice < newStopLoss) {
      // LONG: Price already crossed the new stop loss level - skip setting SL
      this.params.logger.debug("ClientStrategy trailingStop: price intrusion detected, skipping SL update", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        newStopLoss,
        currentPrice,
        reason: "currentPrice below newStopLoss (LONG position)"
      });
      return;
    }

    if (signal.position === "short" && currentPrice > newStopLoss) {
      // SHORT: Price already crossed the new stop loss level - skip setting SL
      this.params.logger.debug("ClientStrategy trailingStop: price intrusion detected, skipping SL update", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        newStopLoss,
        currentPrice,
        reason: "currentPrice above newStopLoss (SHORT position)"
      });
      return;
    }

    // Check for conflict with existing trailing take profit
    const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
    
    if (signal.position === "long" && newStopLoss >= effectiveTakeProfit) {
      // LONG: New SL would be at or above current TP - invalid configuration
      this.params.logger.debug("ClientStrategy trailingStop: SL/TP conflict detected, skipping SL update", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        newStopLoss,
        effectiveTakeProfit,
        reason: "newStopLoss >= effectiveTakeProfit (LONG position)"
      });
      return;
    }

    if (signal.position === "short" && newStopLoss <= effectiveTakeProfit) {
      // SHORT: New SL would be at or below current TP - invalid configuration
      this.params.logger.debug("ClientStrategy trailingStop: SL/TP conflict detected, skipping SL update", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        newStopLoss,
        effectiveTakeProfit,
        reason: "newStopLoss <= effectiveTakeProfit (SHORT position)"
      });
      return;
    }

    // Execute trailing logic
    TRAILING_STOP_LOSS_FN(this, this._pendingSignal, percentShift);

    // Persist updated signal state (inline setPendingSignal content)
    // Note: this._pendingSignal already mutated by TRAILING_STOP_FN, no reassignment needed
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      const publicSignal = TO_PUBLIC_SIGNAL(this._pendingSignal);
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        publicSignal,
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.execution.context.symbol,
        this.params.strategyName,
        this.params.exchangeName,
      );
    }
  }

  /**
   * Adjusts the trailing take-profit distance for an active pending signal.
   *
   * Updates the take-profit distance by a percentage adjustment relative to the original TP distance.
   * Negative percentShift brings TP closer to entry, positive percentShift moves it further.
   * Once direction is set on first call, subsequent calls must continue in same direction.
   *
   * Price intrusion protection: If current price has already crossed the new TP level,
   * the update is skipped to prevent immediate TP triggering.
   *
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to TP distance (-100 to 100)
   * @param currentPrice - Current market price to check for intrusion
   * @param backtest - Whether running in backtest mode
   * @returns Promise that resolves when trailing TP is updated
   * 
   * @example
   * ```typescript
   * // LONG: entry=100, originalTP=110, distance=10%, currentPrice=102
   * // Move TP further by 50%: newTP = 100 + 15% = 115
   * await strategy.trailingTake("BTCUSDT", 50, 102, false);
   * 
   * // SHORT: entry=100, originalTP=90, distance=10%, currentPrice=98  
   * // Move TP closer by 30%: newTP = 100 - 7% = 93
   * await strategy.trailingTake("BTCUSDT", -30, 98, false);
   * ```
   */
  public async trailingTake(
    symbol: string,
    percentShift: number,
    currentPrice: number,
    backtest: boolean
  ): Promise<void> {
    this.params.logger.debug("ClientStrategy trailingTake", {
      symbol,
      percentShift,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });

    // Validation: must have pending signal
    if (!this._pendingSignal) {
      throw new Error(
        `ClientStrategy trailingTake: No pending signal exists for symbol=${symbol}`
      );
    }

    // Validation: percentShift must be valid
    if (typeof percentShift !== "number" || !isFinite(percentShift)) {
      throw new Error(
        `ClientStrategy trailingTake: percentShift must be a finite number, got ${percentShift} (${typeof percentShift})`
      );
    }

    if (percentShift < -100 || percentShift > 100) {
      throw new Error(
        `ClientStrategy trailingTake: percentShift must be in range [-100, 100], got ${percentShift}`
      );
    }

    if (percentShift === 0) {
      throw new Error(
        `ClientStrategy trailingTake: percentShift cannot be 0`
      );
    }

    // Validation: currentPrice must be valid
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `ClientStrategy trailingTake: currentPrice must be a positive finite number, got ${currentPrice}`
      );
    }

    // Calculate what the new take profit would be
    const signal = this._pendingSignal;
    const tpDistancePercent = Math.abs((signal.priceTakeProfit - signal.priceOpen) / signal.priceOpen * 100);
    const newTpDistancePercent = tpDistancePercent + percentShift;
    
    let newTakeProfit: number;
    if (signal.position === "long") {
      newTakeProfit = signal.priceOpen * (1 + newTpDistancePercent / 100);
    } else {
      newTakeProfit = signal.priceOpen * (1 - newTpDistancePercent / 100);
    }

    // Check for price intrusion before executing trailing logic
    if (signal.position === "long" && currentPrice > newTakeProfit) {
      // LONG: Price already crossed the new take profit level - skip setting TP
      this.params.logger.debug("ClientStrategy trailingTake: price intrusion detected, skipping TP update", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        newTakeProfit,
        currentPrice,
        reason: "currentPrice above newTakeProfit (LONG position)"
      });
      return;
    }

    if (signal.position === "short" && currentPrice < newTakeProfit) {
      // SHORT: Price already crossed the new take profit level - skip setting TP
      this.params.logger.debug("ClientStrategy trailingTake: price intrusion detected, skipping TP update", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        newTakeProfit,
        currentPrice,
        reason: "currentPrice below newTakeProfit (SHORT position)"
      });
      return;
    }

    // Check for conflict with existing trailing stop loss
    const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;
    
    if (signal.position === "long" && newTakeProfit <= effectiveStopLoss) {
      // LONG: New TP would be at or below current SL - invalid configuration
      this.params.logger.debug("ClientStrategy trailingTake: TP/SL conflict detected, skipping TP update", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        newTakeProfit,
        effectiveStopLoss,
        reason: "newTakeProfit <= effectiveStopLoss (LONG position)"
      });
      return;
    }

    if (signal.position === "short" && newTakeProfit >= effectiveStopLoss) {
      // SHORT: New TP would be at or above current SL - invalid configuration
      this.params.logger.debug("ClientStrategy trailingTake: TP/SL conflict detected, skipping TP update", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        newTakeProfit,
        effectiveStopLoss,
        reason: "newTakeProfit >= effectiveStopLoss (SHORT position)"
      });
      return;
    }

    // Execute trailing logic
    TRAILING_TAKE_PROFIT_FN(this, this._pendingSignal, percentShift);

    // Persist updated signal state (inline setPendingSignal content)
    // Note: this._pendingSignal already mutated by TRAILING_PROFIT_FN, no reassignment needed
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      const publicSignal = TO_PUBLIC_SIGNAL(this._pendingSignal);
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        publicSignal,
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.execution.context.symbol,
        this.params.strategyName,
        this.params.exchangeName
      );
    }
  }
}

export default ClientStrategy;
