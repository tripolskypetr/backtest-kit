import { IScheduledSignalRow } from "../interfaces/Strategy.interface";
import { GLOBAL_CONFIG } from "../config/params";

const validateScheduledSignal = (signal: IScheduledSignalRow, currentPrice: number): void => {
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

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ scheduled сигналов
    {
      if (isFinite(signal.priceOpen)) {
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

    // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ scheduled сигналов
    {
      if (isFinite(signal.priceOpen)) {
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
    if (signal.minuteEstimatedTime === Infinity && GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES !== Infinity) {
      errors.push(
        `minuteEstimatedTime cannot be Infinity when CC_MAX_SIGNAL_LIFETIME_MINUTES is not Infinity`
      );
    }
    if (signal.minuteEstimatedTime !== Infinity && !Number.isInteger(signal.minuteEstimatedTime)) {
      errors.push(
        `minuteEstimatedTime must be an integer (whole number), got ${signal.minuteEstimatedTime}`
      );
    }
  }

  // ЗАЩИТА ОТ ВЕЧНЫХ СИГНАЛОВ: ограничиваем максимальное время жизни сигнала
  {
    if (GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES !== Infinity && signal.minuteEstimatedTime > GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES) {
      const days = (signal.minuteEstimatedTime / 60 / 24).toFixed(1);
      const maxDays = (GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES / 60 / 24).toFixed(0);
      errors.push(
        `minuteEstimatedTime too large (${signal.minuteEstimatedTime} minutes = ${days} days). ` +
          `Maximum: ${GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES} minutes (${maxDays} days) to prevent strategy deadlock. ` +
          `Eternal signals block risk limits and prevent new trades.`
      );
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
    // pendingAt === 0 is allowed for scheduled signals (set to SCHEDULED_SIGNAL_PENDING_MOCK until activation)
  }

  // Кидаем ошибку если есть проблемы
  if (errors.length > 0) {
    throw new Error(
      `Invalid signal for ${signal.position} position:\n${errors.join("\n")}`
    );
  }
};

export default validateScheduledSignal;
