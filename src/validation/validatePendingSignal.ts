import { ISignalRow } from "../interfaces/Strategy.interface";
import validateCommonSignal from "./validateCommonSignal";

export const validatePendingSignal = (signal: ISignalRow, currentPrice: number): void => {
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

  // ЗАЩИТА ОТ МОМЕНТАЛЬНОГО ЗАКРЫТИЯ: проверяем что позиция не закроется сразу после открытия
  if (signal.position === "long") {
    if (isFinite(currentPrice)) {
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

  if (signal.position === "short") {
    if (isFinite(currentPrice)) {
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

  if (errors.length > 0) {
    throw new Error(
      `Invalid signal for ${signal.position} position:\n${errors.join("\n")}`
    );
  }
};

export default validatePendingSignal;
