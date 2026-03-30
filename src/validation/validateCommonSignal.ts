import { ISignalDto } from "../interfaces/Strategy.interface";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Validates the common fields of ISignalDto that apply to both pending and scheduled signals.
 *
 * Checks:
 * - position is "long" or "short"
 * - priceOpen, priceTakeProfit, priceStopLoss are finite positive numbers
 * - price relationships are correct for position direction (TP/SL on correct sides of priceOpen)
 * - TP/SL distance constraints from GLOBAL_CONFIG
 * - minuteEstimatedTime is valid
 *
 * Does NOT check:
 * - currentPrice vs SL/TP (immediate close protection — handled by pending/scheduled validators)
 * - ISignalRow-specific fields: id, exchangeName, strategyName, symbol, _isScheduled, scheduledAt, pendingAt
 *
 * @deprecated This is an internal code for unit tests. Use `validateSignal` in Strategy::getSignal
 * 
 * @param signal - Signal DTO to validate
 * @returns Array of error strings (empty if valid)
 */
export const validateCommonSignal = (signal: ISignalDto) => {
  const errors: string[] = [];

  // Валидация position
  {
    if (signal.position === undefined || signal.position === null) {
      errors.push('position is required and must be "long" or "short"');
    }
    if (signal.position !== "long" && signal.position !== "short") {
      errors.push(`position must be "long" or "short", got "${signal.position}"`);
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

  // Кидаем ошибку если есть проблемы
  if (errors.length > 0) {
    throw new Error(
      `Invalid signal for ${signal.position} position:\n${errors.join("\n")}`
    );
  }
};

export default validateCommonSignal;
