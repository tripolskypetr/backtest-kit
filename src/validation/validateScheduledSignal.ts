import { IScheduledSignalRow } from "../interfaces/Strategy.interface";
import validateCommonSignal from "./validateCommonSignal";

/**
 * Validates a scheduled signal before it is registered for activation.
 *
 * Checks:
 * - ISignalRow-specific fields: id, exchangeName, strategyName, symbol, _isScheduled
 * - currentPrice is a finite positive number
 * - Common signal fields via validateCommonSignal (position, prices, TP/SL relationships, minuteEstimatedTime)
 * - priceOpen is between SL and TP — position would not be immediately closed upon activation
 * - scheduledAt is a positive number (pendingAt === 0 is allowed until activation)
 *
 * @deprecated This is an internal code for unit tests. Use `validateSignal` in Strategy::getSignal
 * 
 * @param signal - Scheduled signal row to validate
 * @param currentPrice - Current market price at the moment of signal creation
 * @throws {Error} If any validation check fails
 */
export const validateScheduledSignal = (signal: IScheduledSignalRow, currentPrice: number): void => {
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

  if (errors.length > 0) {
    throw new Error(
      `Invalid signal for ${signal.position} position:\n${errors.join("\n")}`
    );
  }

  validateCommonSignal(signal);

  // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ scheduled сигналов
  if (signal.position === "long") {
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

  if (signal.position === "short") {
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

  if (errors.length > 0) {
    throw new Error(
      `Invalid signal for ${signal.position} position:\n${errors.join("\n")}`
    );
  }
};

export default validateScheduledSignal;
