import {
  errorData,
  getErrorMessage,
  not,
  randomString,
  singleshot,
  sleep,
  str,
  trycatch,
} from "functools-kit";
import {
  IStrategy,
  ISignalRow,
  ISignalDto,
  IScheduledSignalRow,
  IScheduledSignalCancelRow,
  IScheduledSignalActivateRow,
  ISignalCloseRow,
  IPublicSignalRow,
  IStrategyParams,
  IStrategyTickResult,
  IStrategyTickResultIdle,
  IStrategyTickResultScheduled,
  IStrategyTickResultWaiting,
  IStrategyTickResultOpened,
  IStrategyTickResultActive,
  IStrategyTickResultClosed,
  IStrategyTickResultCancelled,
  SignalInterval,
  StrategyName,
  StrategyCancelReason,
  ICommitRow,
} from "../interfaces/Strategy.interface";
import toProfitLossDto from "../helpers/toProfitLossDto";
import { getEffectivePriceOpen as GET_EFFECTIVE_PRICE_OPEN } from "../helpers/getEffectivePriceOpen";
import { ICandleData } from "../interfaces/Exchange.interface";
import { PersistSignalAdapter, PersistScheduleAdapter } from "../classes/Persist";
import backtest, { ExecutionContextService } from "../lib";
import { errorEmitter, backtestScheduleOpenSubject } from "../config/emitters";
import { GLOBAL_CONFIG } from "../config/params";
import toPlainString from "../helpers/toPlainString";
import { getTotalClosed } from "../helpers/getTotalClosed";
import beginTime from "../utils/beginTime";
import { StrategyCommitContract } from "../contract/StrategyCommit.contract";
import { getDebugTimestamp } from "../helpers/getDebugTimestamp";

const INTERVAL_MINUTES: Record<SignalInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
};

/**
 * Type for partial profit/loss events queued in ClientStrategy._commitQueue.
 * These events are emitted to onCommit callback with proper execution context timestamp.
 */
type Partials = Array<{ 
  type: "profit" | "loss";
  percent: number;
  currentPrice: number;
  costBasisAtClose: number;
  entryCountAtClose: number;
  debugTimestamp?: number;
}>;

/**
 * Mock value for scheduled signal pendingAt timestamp.
 * Used to indicate that the actual pendingAt will be set upon activation.
 */
const SCHEDULED_SIGNAL_PENDING_MOCK = 0;

const TIMEOUT_SYMBOL = Symbol('timeout');

/**
 * Calls onSignalSync callback for signal-open event.
 *
 * Invoked BEFORE setPendingSignal to give the external system a chance to confirm
 * that the limit order was filled on the exchange. If the callback returns false
 * (or throws), the position open is skipped and the strategy state is NOT mutated.
 * The framework will retry on the next tick.
 */
const CALL_SIGNAL_SYNC_OPEN_FN = trycatch(
  async (
    timestamp: number,
    currentPrice: number,
    pendingSignal: ISignalRow,
    self: ClientStrategy
  ): Promise<boolean> => {
    const publicSignal = TO_PUBLIC_SIGNAL(pendingSignal, currentPrice);
    const pnl = toProfitLossDto(pendingSignal, currentPrice);
    return await self.params.onSignalSync({
      action: "signal-open",
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      backtest: self.params.execution.context.backtest,
      signalId: pendingSignal.id,
      timestamp,
      signal: publicSignal,
      cost: pendingSignal.cost,
      currentPrice,
      position: publicSignal.position,
      pnl,
      priceOpen: publicSignal.priceOpen,
      priceTakeProfit: publicSignal.priceTakeProfit,
      priceStopLoss: publicSignal.priceStopLoss,
      originalPriceTakeProfit: publicSignal.originalPriceTakeProfit,
      originalPriceStopLoss: publicSignal.originalPriceStopLoss,
      originalPriceOpen: publicSignal.originalPriceOpen,
      scheduledAt: publicSignal.scheduledAt,
      pendingAt: publicSignal.pendingAt,
      totalEntries: publicSignal.totalEntries,
      totalPartials: publicSignal.totalPartials,
    });
  },
  {
    defaultValue: false,
  }
);

/**
 * Calls onSignalSync callback for signal-close event.
 *
 * Invoked BEFORE setPendingSignal(null) to give the external system a chance to confirm
 * that the position was closed on the exchange (e.g. market order filled, OCO cancelled).
 * If the callback returns false (or throws), the position close is skipped and the
 * strategy state is NOT mutated. The framework will retry on the next tick.
 */
const CALL_SIGNAL_SYNC_CLOSE_FN = trycatch(
  async (
    timestamp: number,
    currentPrice: number,
    closeReason: "time_expired" | "take_profit" | "stop_loss" | "closed",
    signal: ISignalRow,
    self: ClientStrategy
  ): Promise<boolean> => {
    const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
    const pnl = toProfitLossDto(signal, currentPrice);
    return await self.params.onSignalSync({
      action: "signal-close",
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      backtest: self.params.execution.context.backtest,
      signalId: signal.id,
      timestamp,
      signal: publicSignal,
      currentPrice,
      pnl,
      position: publicSignal.position,
      priceOpen: publicSignal.priceOpen,
      priceTakeProfit: publicSignal.priceTakeProfit,
      priceStopLoss: publicSignal.priceStopLoss,
      originalPriceTakeProfit: publicSignal.originalPriceTakeProfit,
      originalPriceStopLoss: publicSignal.originalPriceStopLoss,
      originalPriceOpen: publicSignal.originalPriceOpen,
      scheduledAt: publicSignal.scheduledAt,
      pendingAt: publicSignal.pendingAt,
      closeReason,
      totalEntries: publicSignal.totalEntries,
      totalPartials: publicSignal.totalPartials,
    });
  },
  {
    defaultValue: false,
  }
);

/**
 * Calls onCommit callback with strategy commit event.
 *
 * Wraps the callback in trycatch to prevent errors from breaking the flow.
 * Used by ClientStrategy methods that modify signal state (partial, trailing, breakeven, cancel, close).
 *
 * @param self - ClientStrategy instance
 * @param event - Strategy commit event to emit
 */
const CALL_COMMIT_FN = trycatch(
  async (
    self: ClientStrategy,
    event: StrategyCommitContract
  ): Promise<void> => {
    await self.params.onCommit(event);
  },
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_COMMIT_FN thrown";
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

/**
 * Processes queued commit events with proper execution context timestamp.
 *
 * Commit events from partialProfit, partialLoss, breakeven, trailingStop, trailingTake
 * are queued in _commitQueue and processed here with correct timestamp from
 * execution context (tick's when or backtest candle timestamp).
 *
 * @param self - ClientStrategy instance
 * @param timestamp - Timestamp from execution context
 */
const PROCESS_COMMIT_QUEUE_FN = async (
  self: ClientStrategy,
  currentPrice: number,
  timestamp: number
): Promise<void> => {
  if (self._commitQueue.length === 0) {
    return;
  }

  const queue = self._commitQueue;

  {
    self._commitQueue = [];
  }

  if (!self._pendingSignal) {
    return;
  }

  // Get public signal data for commit events (contains effective and original SL/TP)
  const publicSignal = TO_PUBLIC_SIGNAL(self._pendingSignal, currentPrice);

  for (const commit of queue) {
    if (commit.action === "partial-profit") {
      await CALL_COMMIT_FN(self, {
        action: "partial-profit",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        percentToClose: commit.percentToClose,
        currentPrice: commit.currentPrice,
        pnl: toProfitLossDto(self._pendingSignal, commit.currentPrice),
        timestamp,
        totalEntries: publicSignal.totalEntries,
        totalPartials: publicSignal.totalPartials,
        position: publicSignal.position,
        priceOpen: publicSignal.priceOpen,
        signalId: publicSignal.id,
        priceTakeProfit: publicSignal.priceTakeProfit,
        priceStopLoss: publicSignal.priceStopLoss,
        originalPriceTakeProfit: publicSignal.originalPriceTakeProfit,
        originalPriceStopLoss: publicSignal.originalPriceStopLoss,
        originalPriceOpen: publicSignal.originalPriceOpen,
        scheduledAt: publicSignal.scheduledAt,
        pendingAt: publicSignal.pendingAt,
      });
      continue
    }
    if (commit.action === "partial-loss") {
      await CALL_COMMIT_FN(self, {
        action: "partial-loss",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        percentToClose: commit.percentToClose,
        currentPrice: commit.currentPrice,
        pnl: toProfitLossDto(self._pendingSignal, commit.currentPrice),
        timestamp,
        totalEntries: publicSignal.totalEntries,
        totalPartials: publicSignal.totalPartials,
        position: publicSignal.position,
        priceOpen: publicSignal.priceOpen,
        signalId: publicSignal.id,
        priceTakeProfit: publicSignal.priceTakeProfit,
        priceStopLoss: publicSignal.priceStopLoss,
        originalPriceTakeProfit: publicSignal.originalPriceTakeProfit,
        originalPriceStopLoss: publicSignal.originalPriceStopLoss,
        originalPriceOpen: publicSignal.originalPriceOpen,
        scheduledAt: publicSignal.scheduledAt,
        pendingAt: publicSignal.pendingAt,
      });
      continue
    }
    if (commit.action === "breakeven") {
      await CALL_COMMIT_FN(self, {
        action: "breakeven",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        currentPrice: commit.currentPrice,
        pnl: toProfitLossDto(self._pendingSignal, commit.currentPrice),
        timestamp,
        totalEntries: publicSignal.totalEntries,
        totalPartials: publicSignal.totalPartials,
        signalId: publicSignal.id,
        position: publicSignal.position,
        priceOpen: publicSignal.priceOpen,
        priceTakeProfit: publicSignal.priceTakeProfit,
        priceStopLoss: publicSignal.priceStopLoss,
        originalPriceTakeProfit: publicSignal.originalPriceTakeProfit,
        originalPriceStopLoss: publicSignal.originalPriceStopLoss,
        originalPriceOpen: publicSignal.originalPriceOpen,
        scheduledAt: publicSignal.scheduledAt,
        pendingAt: publicSignal.pendingAt,
      });
      continue
    }
    if (commit.action === "trailing-stop") {
      await CALL_COMMIT_FN(self, {
        action: "trailing-stop",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        percentShift: commit.percentShift,
        currentPrice: commit.currentPrice,
        pnl: toProfitLossDto(self._pendingSignal, commit.currentPrice),
        timestamp,
        totalEntries: publicSignal.totalEntries,
        totalPartials: publicSignal.totalPartials,
        signalId: publicSignal.id,
        position: publicSignal.position,
        priceOpen: publicSignal.priceOpen,
        priceTakeProfit: publicSignal.priceTakeProfit,
        priceStopLoss: publicSignal.priceStopLoss,
        originalPriceTakeProfit: publicSignal.originalPriceTakeProfit,
        originalPriceStopLoss: publicSignal.originalPriceStopLoss,
        originalPriceOpen: publicSignal.originalPriceOpen,
        scheduledAt: publicSignal.scheduledAt,
        pendingAt: publicSignal.pendingAt,
      });
      continue;
    }
    if (commit.action === "trailing-take") {
      await CALL_COMMIT_FN(self, {
        action: "trailing-take",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        percentShift: commit.percentShift,
        currentPrice: commit.currentPrice,
        pnl: toProfitLossDto(self._pendingSignal, commit.currentPrice),
        timestamp,
        totalEntries: publicSignal.totalEntries,
        totalPartials: publicSignal.totalPartials,
        signalId: publicSignal.id,
        position: publicSignal.position,
        priceOpen: publicSignal.priceOpen,
        priceTakeProfit: publicSignal.priceTakeProfit,
        priceStopLoss: publicSignal.priceStopLoss,
        originalPriceTakeProfit: publicSignal.originalPriceTakeProfit,
        originalPriceStopLoss: publicSignal.originalPriceStopLoss,
        originalPriceOpen: publicSignal.originalPriceOpen,
        scheduledAt: publicSignal.scheduledAt,
        pendingAt: publicSignal.pendingAt,
      });
      continue;
    }
    if (commit.action === "average-buy") {
      const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(self._pendingSignal);
      await CALL_COMMIT_FN(self, {
        action: "average-buy",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        currentPrice: commit.currentPrice,
        cost: commit.cost,
        effectivePriceOpen,
        pnl: toProfitLossDto(self._pendingSignal, commit.currentPrice),
        timestamp,
        totalEntries: publicSignal.totalEntries,
        totalPartials: publicSignal.totalPartials,
        signalId: publicSignal.id,
        position: publicSignal.position,
        priceOpen: publicSignal.priceOpen,
        priceTakeProfit: publicSignal.priceTakeProfit,
        priceStopLoss: publicSignal.priceStopLoss,
        originalPriceTakeProfit: publicSignal.originalPriceTakeProfit,
        originalPriceStopLoss: publicSignal.originalPriceStopLoss,
        originalPriceOpen: publicSignal.originalPriceOpen,
        scheduledAt: publicSignal.scheduledAt,
        pendingAt: publicSignal.pendingAt,
      });
      continue;
    }
  }
};

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
const TO_PUBLIC_SIGNAL = <T extends ISignalDto | ISignalRow | IScheduledSignalRow>(signal: T, currentPrice: number): IPublicSignalRow => {
  const hasTrailingSL = "_trailingPriceStopLoss" in signal && signal._trailingPriceStopLoss !== undefined;
  const hasTrailingTP = "_trailingPriceTakeProfit" in signal && signal._trailingPriceTakeProfit !== undefined;
  const partialExecuted = "_partial" in signal
    ? getTotalClosed(signal).totalClosedPercent
    : 0;
  const totalEntries = ("_entry" in signal && Array.isArray(signal._entry))
    ? signal._entry.length
    : 1;
  const totalPartials = ("_partial" in signal && Array.isArray(signal._partial))
    ? signal._partial.length
    : 0;
  const effectivePriceOpen = "_entry" in signal ? GET_EFFECTIVE_PRICE_OPEN(signal): signal.priceOpen;
  return {
    ...structuredClone(signal) as ISignalRow | IScheduledSignalRow,
    priceOpen: effectivePriceOpen,
    priceStopLoss: hasTrailingSL ? signal._trailingPriceStopLoss : signal.priceStopLoss,
    priceTakeProfit: hasTrailingTP ? signal._trailingPriceTakeProfit : signal.priceTakeProfit,
    originalPriceOpen: signal.priceOpen,
    originalPriceStopLoss: signal.priceStopLoss,
    originalPriceTakeProfit: signal.priceTakeProfit,
    partialExecuted,
    totalEntries,
    totalPartials,
    pnl: toProfitLossDto(signal as ISignalRow, currentPrice),
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
    if (signal.pendingAt <= 0 && !isScheduled) {
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
      const alignedTime = Math.floor(currentTime / intervalMs) * intervalMs;

      // Проверяем что наступил новый интервал (по aligned timestamp)
      if (
        self._lastSignalTimestamp !== null &&
        alignedTime === self._lastSignalTimestamp
      ) {
        return null;
      }

      self._lastSignalTimestamp = alignedTime;
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
          cost: signal.cost || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST,
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
          timestamp: currentTime,
          _isScheduled: false,
          _entry: [{ price: signal.priceOpen, cost: signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, debugTimestamp: currentTime }],
        };

        // Валидируем сигнал перед возвратом
        VALIDATE_SIGNAL_FN(signalRow, currentPrice, false);

        return signalRow;
      }

      // ОЖИДАНИЕ АКТИВАЦИИ: создаем scheduled signal (risk check при активации)
      const scheduledSignalRow: IScheduledSignalRow = {
        id: signal.id || randomString(),
        cost: signal.cost || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST,
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
        pendingAt: SCHEDULED_SIGNAL_PENDING_MOCK, // Временно, обновится при активации
        timestamp: currentTime,
        _isScheduled: true,
        _entry: [{ price: signal.priceOpen, cost: signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, debugTimestamp: currentTime }],
      };

      // Валидируем сигнал перед возвратом
      VALIDATE_SIGNAL_FN(scheduledSignalRow, currentPrice, true);

      return scheduledSignalRow;
    }

    const signalRow: ISignalRow = {
      id: signal.id || randomString(),
      cost: signal.cost || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST,
      priceOpen: currentPrice,
      ...structuredClone(signal),
      note: toPlainString(signal.note),
      symbol: self.params.execution.context.symbol,
      exchangeName: self.params.method.context.exchangeName,
      strategyName: self.params.method.context.strategyName,
      frameName: self.params.method.context.frameName,
      scheduledAt: currentTime,
      pendingAt: currentTime, // Для immediate signal оба времени одинаковые
      timestamp: currentTime,
      _isScheduled: false,
      _entry: [{ price: currentPrice, cost: signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, debugTimestamp: currentTime }],
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

  // Call onInit callback
  await self.params.onInit(
    self.params.execution.context.symbol,
    self.params.strategyName,
    self.params.exchangeName,
    self.params.method.context.frameName,
    self.params.execution.context.backtest
  );
};

const WAIT_FOR_DISPOSE_FN = async (self: ClientStrategy) => {
  self.params.logger.debug("ClientStrategy dispose");
  await self.params.onDispose(
    self.params.execution.context.symbol,
    self.params.strategyName,
    self.params.exchangeName,
    self.params.method.context.frameName,
    self.params.execution.context.backtest
  );
};

const PARTIAL_PROFIT_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  percentToClose: number,
  currentPrice: number
): boolean => {
  // Initialize partial array if not present
  if (!signal._partial) signal._partial = [];

  // Check if would exceed 100% total closed (dollar-basis, DCA-aware)
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed(signal);
  const totalInvested = (signal._entry ?? []).reduce((s, e) => s + e.cost, 0) || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST;
  const newPartialDollar = (percentToClose / 100) * remainingCostBasis;
  const newTotalClosedDollar = (totalClosedPercent / 100) * totalInvested + newPartialDollar;

  if (newTotalClosedDollar > totalInvested) {
    self.params.logger.warn(
      "PARTIAL_PROFIT_FN: would exceed 100% closed (dollar basis), skipping",
      {
        signalId: signal.id,
        totalClosedPercent,
        remainingCostBasis,
        percentToClose,
        newPartialDollar,
        totalInvested,
      }
    );
    return false;
  }

  // Capture effective entry price at the moment of partial close (for DCA-aware PNL)
  const entryCountAtClose = signal._entry ? signal._entry.length : 1;

  // Add new partial close entry
  signal._partial.push({
    type: "profit",
    percent: percentToClose,
    entryCountAtClose,
    currentPrice,
    costBasisAtClose: remainingCostBasis,
    debugTimestamp: getDebugTimestamp(),
  });

  self.params.logger.info("PARTIAL_PROFIT_FN executed", {
    signalId: signal.id,
    percentClosed: percentToClose,
    totalClosedPercent: totalClosedPercent + (newPartialDollar / totalInvested) * 100,
    currentPrice,
  });

  return true;
};

const PARTIAL_LOSS_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  percentToClose: number,
  currentPrice: number
): boolean => {
  // Initialize partial array if not present
  if (!signal._partial) signal._partial = [];

  // Check if would exceed 100% total closed (dollar-basis, DCA-aware)
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed(signal);
  const totalInvested = (signal._entry ?? []).reduce((s, e) => s + e.cost, 0) || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST;
  const newPartialDollar = (percentToClose / 100) * remainingCostBasis;
  const newTotalClosedDollar = (totalClosedPercent / 100) * totalInvested + newPartialDollar;

  if (newTotalClosedDollar > totalInvested) {
    self.params.logger.warn(
      "PARTIAL_LOSS_FN: would exceed 100% closed (dollar basis), skipping",
      {
        signalId: signal.id,
        totalClosedPercent,
        remainingCostBasis,
        percentToClose,
        newPartialDollar,
        totalInvested,
      }
    );
    return false;
  }

  const entryCountAtClose = signal._entry ? signal._entry.length : 1;

  // Add new partial close entry
  signal._partial.push({
    type: "loss",
    percent: percentToClose,
    currentPrice,
    entryCountAtClose,
    costBasisAtClose: remainingCostBasis,
    debugTimestamp: getDebugTimestamp(),
  });

  self.params.logger.warn("PARTIAL_LOSS_FN executed", {
    signalId: signal.id,
    percentClosed: percentToClose,
    totalClosedPercent: totalClosedPercent + (newPartialDollar / totalInvested) * 100,
    currentPrice,
  });

  return true;
};

const TRAILING_STOP_LOSS_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  percentShift: number
): boolean => {
  const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
  // CRITICAL: Always calculate from ORIGINAL SL, not from current trailing SL
  // This prevents error accumulation on repeated calls
  const originalSlDistancePercent = Math.abs((effectivePriceOpen - signal.priceStopLoss) / effectivePriceOpen * 100);

  // Calculate new stop-loss distance percentage by adding shift to ORIGINAL distance
  // Negative percentShift: reduces distance % (tightens stop, moves SL toward entry or beyond)
  // Positive percentShift: increases distance % (loosens stop, moves SL away from entry)
  const newSlDistancePercent = originalSlDistancePercent + percentShift;

  // Calculate new stop-loss price based on new distance percentage
  // Negative newSlDistancePercent means SL crosses entry into profit zone
  let newStopLoss: number;

  if (signal.position === "long") {
    // LONG: SL is below entry (or above entry if in profit zone)
    // Formula: entry * (1 - newDistance%)
    // Example: entry=100, originalSL=90 (10%), shift=-5% → newDistance=5% → 100 * 0.95 = 95 (tighter)
    newStopLoss = effectivePriceOpen * (1 - newSlDistancePercent / 100);
  } else {
    // SHORT: SL is above entry (or below entry if in profit zone)
    // Formula: entry * (1 + newDistance%)
    // Example: entry=100, originalSL=110 (10%), shift=-5% → newDistance=5% → 100 * 1.05 = 105 (tighter)
    newStopLoss = effectivePriceOpen * (1 + newSlDistancePercent / 100);
  }

  const currentTrailingSL = signal._trailingPriceStopLoss;
  const isFirstCall = currentTrailingSL === undefined;

  if (isFirstCall) {
    // First call: set trailing SL unconditionally
    signal._trailingPriceStopLoss = newStopLoss;

    self.params.logger.info("TRAILING_STOP_FN executed (first call)", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      originalStopLoss: signal.priceStopLoss,
      originalDistancePercent: originalSlDistancePercent,
      newStopLoss,
      newDistancePercent: newSlDistancePercent,
      percentShift,
      inProfitZone: signal.position === "long" ? newStopLoss > signal.priceOpen : newStopLoss < signal.priceOpen,
    });
    return true;
  } else {
    // CRITICAL: Larger percentShift absorbs smaller one
    // For LONG: higher SL (closer to entry) absorbs lower one
    // For SHORT: lower SL (closer to entry) absorbs higher one
    let shouldUpdate = false;

    if (signal.position === "long") {
      // LONG: update only if new SL is higher (better protection)
      shouldUpdate = newStopLoss > currentTrailingSL;
    } else {
      // SHORT: update only if new SL is lower (better protection)
      shouldUpdate = newStopLoss < currentTrailingSL;
    }

    if (!shouldUpdate) {
      self.params.logger.debug("TRAILING_STOP_FN: new SL not better than current, skipping", {
        signalId: signal.id,
        position: signal.position,
        currentTrailingSL,
        newStopLoss,
        percentShift,
        reason: "larger percentShift absorbs smaller one",
      });
      return false;
    }

    // Update trailing stop-loss
    const previousTrailingSL = signal._trailingPriceStopLoss;
    signal._trailingPriceStopLoss = newStopLoss;

    self.params.logger.info("TRAILING_STOP_FN executed", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      originalStopLoss: signal.priceStopLoss,
      originalDistancePercent: originalSlDistancePercent,
      previousTrailingSL,
      newStopLoss,
      newDistancePercent: newSlDistancePercent,
      percentShift,
      inProfitZone: signal.position === "long" ? newStopLoss > signal.priceOpen : newStopLoss < signal.priceOpen,
    });
    return true;
  }
};

const TRAILING_TAKE_PROFIT_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  percentShift: number
): boolean => {
  const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
  // CRITICAL: Always calculate from ORIGINAL TP, not from current trailing TP
  // This prevents error accumulation on repeated calls
  const originalTpDistancePercent = Math.abs((signal.priceTakeProfit - effectivePriceOpen) / effectivePriceOpen * 100);

  // Calculate new take-profit distance percentage by adding shift to ORIGINAL distance
  // Negative percentShift: reduces distance % (brings TP closer to entry)
  // Positive percentShift: increases distance % (moves TP further from entry)
  const newTpDistancePercent = originalTpDistancePercent + percentShift;

  // Calculate new take-profit price based on new distance percentage
  let newTakeProfit: number;

  if (signal.position === "long") {
    // LONG: TP is above entry
    // Formula: entry * (1 + newDistance%)
    // Example: entry=100, originalTP=110 (10%), shift=-3% → newDistance=7% → 100 * 1.07 = 107 (closer)
    newTakeProfit = effectivePriceOpen * (1 + newTpDistancePercent / 100);
  } else {
    // SHORT: TP is below entry
    // Formula: entry * (1 - newDistance%)
    // Example: entry=100, originalTP=90 (10%), shift=-3% → newDistance=7% → 100 * 0.93 = 93 (closer)
    newTakeProfit = effectivePriceOpen * (1 - newTpDistancePercent / 100);
  }

  const currentTrailingTP = signal._trailingPriceTakeProfit;
  const isFirstCall = currentTrailingTP === undefined;

  if (isFirstCall) {
    // First call: set trailing TP unconditionally
    signal._trailingPriceTakeProfit = newTakeProfit;

    self.params.logger.info("TRAILING_PROFIT_FN executed (first call)", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      originalTakeProfit: signal.priceTakeProfit,
      originalDistancePercent: originalTpDistancePercent,
      newTakeProfit,
      newDistancePercent: newTpDistancePercent,
      percentShift,
    });
    return true;
  } else {
    // CRITICAL: Larger percentShift absorbs smaller one
    // For LONG: lower TP (closer to entry) absorbs higher one
    // For SHORT: higher TP (closer to entry) absorbs lower one
    let shouldUpdate = false;

    if (signal.position === "long") {
      // LONG: update only if new TP is lower (closer to entry, more conservative)
      shouldUpdate = newTakeProfit < currentTrailingTP;
    } else {
      // SHORT: update only if new TP is higher (closer to entry, more conservative)
      shouldUpdate = newTakeProfit > currentTrailingTP;
    }

    if (!shouldUpdate) {
      self.params.logger.debug("TRAILING_PROFIT_FN: new TP not better than current, skipping", {
        signalId: signal.id,
        position: signal.position,
        currentTrailingTP,
        newTakeProfit,
        percentShift,
        reason: "larger percentShift absorbs smaller one",
      });
      return false;
    }

    // Update trailing take-profit
    const previousTrailingTP = signal._trailingPriceTakeProfit;
    signal._trailingPriceTakeProfit = newTakeProfit;

    self.params.logger.info("TRAILING_PROFIT_FN executed", {
      signalId: signal.id,
      position: signal.position,
      priceOpen: signal.priceOpen,
      originalTakeProfit: signal.priceTakeProfit,
      originalDistancePercent: originalTpDistancePercent,
      previousTrailingTP,
      newTakeProfit,
      newDistancePercent: newTpDistancePercent,
      percentShift,
    });
    return true;
  }
};

const BREAKEVEN_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  currentPrice: number
): boolean => {
  const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
  // Calculate breakeven threshold based on slippage and fees
  // Need to cover: entry slippage + entry fee + exit slippage + exit fee
  // Total: (slippage + fee) * 2 transactions
  const breakevenThresholdPercent =
    (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2;

  // Check if trailing stop is already set
  if (signal._trailingPriceStopLoss !== undefined) {
    const trailingStopLoss = signal._trailingPriceStopLoss;
    const breakevenPrice = effectivePriceOpen;

    if (signal.position === "long") {
      // LONG: trailing SL is positive if it's above entry (in profit zone)
      const isPositiveTrailing = trailingStopLoss > effectivePriceOpen;

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
        const thresholdPrice = effectivePriceOpen * (1 + breakevenThresholdPercent / 100);
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
      const isPositiveTrailing = trailingStopLoss < effectivePriceOpen;

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
        const thresholdPrice = effectivePriceOpen * (1 - breakevenThresholdPercent / 100);
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
  const breakevenPrice = effectivePriceOpen;

  // Calculate threshold price
  let thresholdPrice: number;
  let isThresholdReached: boolean;
  let canMoveToBreakeven: boolean;

  if (signal.position === "long") {
    // LONG: threshold reached when price goes UP by breakevenThresholdPercent from entry
    thresholdPrice = effectivePriceOpen * (1 + breakevenThresholdPercent / 100);
    isThresholdReached = currentPrice >= thresholdPrice;

    // Can move to breakeven only if threshold reached and SL is below entry
    canMoveToBreakeven = isThresholdReached && currentStopLoss < breakevenPrice;
  } else {
    // SHORT: threshold reached when price goes DOWN by breakevenThresholdPercent from entry
    thresholdPrice = effectivePriceOpen * (1 - breakevenThresholdPercent / 100);
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
      ? ((currentPrice - effectivePriceOpen) / effectivePriceOpen * 100)
      : ((effectivePriceOpen - currentPrice) / effectivePriceOpen * 100),
  });

  return true;
};

const AVERAGE_BUY_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  currentPrice: number,
  cost: number = GLOBAL_CONFIG.CC_POSITION_ENTRY_COST
): boolean => {
  // Ensure _entry is initialized (handles signals loaded from disk without _entry)
  if (!signal._entry || signal._entry.length === 0) {
    signal._entry = [{ price: signal.priceOpen, cost: GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, debugTimestamp: getDebugTimestamp() }];
  }

  if (signal.position === "long") {
    // LONG: new entry must beat the all-time low — strictly below every prior entry price
    const minEntryPrice = Math.min(...signal._entry.map((e) => e.price));
    if (!GLOBAL_CONFIG.CC_ENABLE_DCA_EVERYWHERE && currentPrice >= minEntryPrice) {
      self.params.logger.debug("AVERAGE_BUY_FN: rejected — currentPrice >= min entry price (LONG)", {
        signalId: signal.id,
        position: signal.position,
        currentPrice,
        minEntryPrice,
        reason: "must beat all-time low for LONG",
      });
      return false;
    }
  } else {
    // SHORT: new entry must beat the all-time high — strictly above every prior entry price
    const maxEntryPrice = Math.max(...signal._entry.map((e) => e.price));
    if (!GLOBAL_CONFIG.CC_ENABLE_DCA_EVERYWHERE && currentPrice <= maxEntryPrice) {
      self.params.logger.debug("AVERAGE_BUY_FN: rejected — currentPrice <= max entry price (SHORT)", {
        signalId: signal.id,
        position: signal.position,
        currentPrice,
        maxEntryPrice,
        reason: "must beat all-time high for SHORT",
      });
      return false;
    }
  }

  signal._entry.push({ price: currentPrice, cost, debugTimestamp: getDebugTimestamp() });

  self.params.logger.info("AVERAGE_BUY_FN executed", {
    signalId: signal.id,
    position: signal.position,
    originalPriceOpen: signal.priceOpen,
    newEntryPrice: currentPrice,
    newEffectivePrice: GET_EFFECTIVE_PRICE_OPEN(signal),
    totalEntries: signal._entry.length,
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
    signal: TO_PUBLIC_SIGNAL(scheduled, currentPrice),
    currentPrice: currentPrice,
    closeTimestamp: currentTime,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    reason: "timeout",
    createdAt: currentTime,
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
    signal: TO_PUBLIC_SIGNAL(scheduled, currentPrice),
    currentPrice: currentPrice,
    closeTimestamp: currentTime,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    reason: "price_reject",
    createdAt: currentTime,
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

  // КРИТИЧЕСКИ ВАЖНО: обновляем pendingAt при активации
  const activatedSignal: ISignalRow = {
    ...scheduled,
    pendingAt: activationTime,
    _isScheduled: false,
  };

  // Sync open: if external system rejects — cancel scheduled signal instead of opening
  const syncOpenAllowed = await CALL_SIGNAL_SYNC_OPEN_FN(
    activationTime,
    activatedSignal.priceOpen,
    activatedSignal,
    self
  );

  if (!syncOpenAllowed) {
    self.params.logger.info("ClientStrategy scheduled signal activation rejected by sync", {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
    });
    await self.setScheduledSignal(null);
    await CALL_COMMIT_FN(self, {
      action: "cancel-scheduled",
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      signalId: scheduled.id,
      backtest: self.params.execution.context.backtest,
      timestamp: activationTime,
      totalEntries: scheduled._entry?.length ?? 1,
      totalPartials: scheduled._partial?.length ?? 0,
      originalPriceOpen: scheduled.priceOpen,
      pnl: toProfitLossDto(scheduled, scheduled.priceOpen),
    });
    return null;
  }

  await self.setScheduledSignal(null);

  await self.setPendingSignal(activatedSignal);

  await CALL_RISK_ADD_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    activatedSignal,
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
    signal: TO_PUBLIC_SIGNAL(self._pendingSignal, self._pendingSignal.priceOpen),
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    currentPrice: self._pendingSignal.priceOpen,
    backtest: self.params.execution.context.backtest,
    createdAt: activationTime,
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

const CALL_SCHEDULE_PING_CALLBACKS_FN = trycatch(
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    scheduled: IScheduledSignalRow,
    timestamp: number,
    backtest: boolean,
    currentPrice?: number,
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(scheduled, currentPrice);

      // Call system onSchedulePing callback first (emits to pingSubject)
      await self.params.onSchedulePing(
        self.params.execution.context.symbol,
        self.params.method.context.strategyName,
        self.params.method.context.exchangeName,
        publicSignal,
        self.params.execution.context.backtest,
        timestamp
      );

      // Call user onSchedulePing callback only if signal is still active (not cancelled, not activated)
      if (self.params.callbacks?.onSchedulePing) {
        await self.params.callbacks.onSchedulePing(
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
  }),
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_SCHEDULE_PING_CALLBACKS_FN thrown";
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

const CALL_ACTIVE_PING_CALLBACKS_FN = trycatch(
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    pending: ISignalRow,
    timestamp: number,
    backtest: boolean,
    currentPrice?: number,
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(pending, currentPrice);

      // Call system onActivePing callback first (emits to activePingSubject)
      await self.params.onActivePing(
        self.params.execution.context.symbol,
        self.params.method.context.strategyName,
        self.params.method.context.exchangeName,
        publicSignal,
        self.params.execution.context.backtest,
        timestamp
      );

      // Call user onActivePing callback only if signal is still active (not closed)
      if (self.params.callbacks?.onActivePing) {
        await self.params.callbacks.onActivePing(
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
  }),
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_ACTIVE_PING_CALLBACKS_FN thrown";
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onActive) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: IScheduledSignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onSchedule) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: IScheduledSignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onCancel) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    priceOpen: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onOpen) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal, priceOpen);
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      if (self.params.callbacks?.onClose) {
        const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
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
  }),
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
  beginTime(async (
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
  }),
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
  beginTime(async (
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      await self.params.risk.addSignal(
        symbol,
        {
          strategyName: self.params.method.context.strategyName,
          riskName: self.params.riskName,
          exchangeName: self.params.method.context.exchangeName,
          frameName: self.params.method.context.frameName,
        },
        {
          position: signal.position,
          priceOpen: signal.priceOpen,
          priceStopLoss: signal.priceStopLoss,
          priceTakeProfit: signal.priceTakeProfit,
          minuteEstimatedTime: signal.minuteEstimatedTime,
          openTimestamp: timestamp,
        }
      );
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  }),
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
  beginTime(async (
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    pendingSignal: ISignalDto | ISignalRow | IScheduledSignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<boolean> => {
    return await ExecutionContextService.runInContext(async () => {
      return await self.params.risk.checkSignal({
        currentSignal: TO_PUBLIC_SIGNAL(pendingSignal, currentPrice),
        symbol: symbol,
        strategyName: self.params.method.context.strategyName,
        exchangeName: self.params.method.context.exchangeName,
        frameName: self.params.method.context.frameName,
        riskName: self.params.riskName,
        currentPrice,
        timestamp,
      });
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    percentTp: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    percentSl: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
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
  }),
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
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL(signal, currentPrice);
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
  }),
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

const CALL_BACKTEST_SCHEDULE_OPEN_FN = trycatch(
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    signal: ISignalRow,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      backtestScheduleOpenSubject.next({
        action: "opened",
        signal: TO_PUBLIC_SIGNAL(signal, signal.priceOpen),
        strategyName: self.params.method.context.strategyName,
        exchangeName: self.params.method.context.exchangeName,
        frameName: self.params.method.context.frameName,
        symbol: symbol,
        currentPrice: signal.priceOpen,
        backtest: true,
        createdAt: timestamp,
      });
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    });
  }),
  {
    fallback: (error) => {
      const message = "ClientStrategy CALL_BACKTEST_SCHEDULE_OPEN_FN thrown";
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
): Promise<IStrategyTickResultWaiting> => {
  const currentTime = self.params.execution.context.when.getTime();

  await CALL_SCHEDULE_PING_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    scheduled,
    currentTime,
    self.params.execution.context.backtest,
    currentPrice
  );

  const pnl = toProfitLossDto(scheduled, currentPrice);

  const result: IStrategyTickResultWaiting = {
    action: "waiting",
    signal: TO_PUBLIC_SIGNAL(scheduled, currentPrice),
    currentPrice: currentPrice,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    percentTp: 0,
    percentSl: 0,
    pnl,
    backtest: self.params.execution.context.backtest,
    createdAt: currentTime,
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
    signal: TO_PUBLIC_SIGNAL(signal, currentPrice),
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    currentPrice: currentPrice,
    backtest: self.params.execution.context.backtest,
    createdAt: currentTime,
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

  // Sync open: if external system rejects — skip open, retry on next tick
  const syncOpenAllowed = await CALL_SIGNAL_SYNC_OPEN_FN(
    currentTime,
    signal.priceOpen,
    signal,
    self
  );

  if (!syncOpenAllowed) {
    self.params.logger.info("ClientStrategy OPEN_NEW_PENDING_SIGNAL_FN rejected by sync", {
      symbol: self.params.execution.context.symbol,
      signalId: signal.id,
    });
    return null;
  }

  await CALL_RISK_ADD_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    signal,
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
    signal: TO_PUBLIC_SIGNAL(signal, signal.priceOpen),
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    currentPrice: signal.priceOpen,
    backtest: self.params.execution.context.backtest,
    createdAt: currentTime,
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
): Promise<IStrategyTickResultClosed | null> => {
  const currentTime = self.params.execution.context.when.getTime();

  // Sync close: if external system rejects — skip close, retry on next tick
  const syncCloseAllowed = await CALL_SIGNAL_SYNC_CLOSE_FN(
    currentTime,
    currentPrice,
    closeReason,
    signal,
    self
  );

  if (!syncCloseAllowed) {
    self.params.logger.info(`ClientStrategy signal ${closeReason} rejected by sync`, {
      symbol: self.params.execution.context.symbol,
      signalId: signal.id,
      closeReason,
    });
    return null;
  }

  const pnl = toProfitLossDto(signal, currentPrice);

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
    signal: TO_PUBLIC_SIGNAL(signal, currentPrice),
    currentPrice: currentPrice,
    closeReason: closeReason,
    closeTimestamp: currentTime,
    pnl: pnl,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    createdAt: currentTime,
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

  await CALL_ACTIVE_PING_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    currentTime,
    self.params.execution.context.backtest,
    currentPrice
  );

  // Calculate percentage of path to TP/SL for partial fill/loss callbacks
  {
    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
    if (signal.position === "long") {
      // For long: calculate progress towards TP or SL
      const currentDistance = currentPrice - effectivePriceOpen;

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
        const tpDistance = effectiveTakeProfit - effectivePriceOpen;
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
        const slDistance = effectivePriceOpen - effectiveStopLoss;
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
      const currentDistance = effectivePriceOpen - currentPrice;

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
        const tpDistance = effectivePriceOpen - effectiveTakeProfit;
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
        const slDistance = effectiveStopLoss - effectivePriceOpen;
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

  const pnl = toProfitLossDto(signal, currentPrice);

  const result: IStrategyTickResultActive = {
    action: "active",
    signal: TO_PUBLIC_SIGNAL(signal, currentPrice),
    currentPrice: currentPrice,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    percentTp,
    percentSl,
    pnl,
    backtest: self.params.execution.context.backtest,
    createdAt: currentTime,
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
    createdAt: currentTime,
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
    signal: TO_PUBLIC_SIGNAL(scheduled, averagePrice),
    currentPrice: averagePrice,
    closeTimestamp: closeTimestamp,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    reason,
    createdAt: closeTimestamp,
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

  // КРИТИЧЕСКИ ВАЖНО: обновляем pendingAt при активации в backtest
  const activatedSignal: ISignalRow = {
    ...scheduled,
    pendingAt: activationTime,
    _isScheduled: false,
  };

  // Sync open: if external system rejects — cancel scheduled signal instead of opening
  const syncOpenAllowed = await CALL_SIGNAL_SYNC_OPEN_FN(
    activationTime,
    activatedSignal.priceOpen,
    activatedSignal,
    self
  );

  if (!syncOpenAllowed) {
    self.params.logger.info("ClientStrategy backtest scheduled signal activation rejected by sync", {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
    });
    await self.setScheduledSignal(null);
    await CALL_COMMIT_FN(self, {
      action: "cancel-scheduled",
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      signalId: scheduled.id,
      backtest: self.params.execution.context.backtest,
      timestamp: activationTime,
      totalEntries: scheduled._entry?.length ?? 1,
      totalPartials: scheduled._partial?.length ?? 0,
      originalPriceOpen: scheduled.priceOpen,
      pnl: toProfitLossDto(scheduled, scheduled.priceOpen),
    });
    return false;
  }

  await self.setScheduledSignal(null);

  await self.setPendingSignal(activatedSignal);

  await CALL_RISK_ADD_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    activatedSignal,
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

  await CALL_BACKTEST_SCHEDULE_OPEN_FN(
    self,
    self.params.execution.context.symbol,
    activatedSignal,
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
): Promise<IStrategyTickResultClosed | null> => {
  // Sync close: if external system rejects — skip close, retry on next candle
  const syncCloseAllowed = await CALL_SIGNAL_SYNC_CLOSE_FN(
    closeTimestamp,
    averagePrice,
    closeReason,
    signal,
    self
  );

  if (!syncCloseAllowed) {
    self.params.logger.info(`ClientStrategy backtest ${closeReason} rejected by sync`, {
      symbol: self.params.execution.context.symbol,
      signalId: signal.id,
      closeReason,
    });
    return null;
  }

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
    signal: TO_PUBLIC_SIGNAL(signal, averagePrice),
    currentPrice: averagePrice,
    closeReason: closeReason,
    closeTimestamp: closeTimestamp,
    pnl: pnl,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    createdAt: closeTimestamp,
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
      // Сигнал был отменен через cancel() в onSchedulePing
      const result = await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
        self,
        scheduled,
        averagePrice,
        candle.timestamp,
        "user"
      );
      return { activated: false, cancelled: true, activationIndex: i, result };
    }

    // КРИТИЧНО: Проверяем был ли сигнал активирован пользователем через activateScheduled()
    // Обрабатываем inline (как в tick()) с риск-проверкой по averagePrice
    if (self._activatedSignal) {
      const activatedSignal = self._activatedSignal;
      self._activatedSignal = null;

      // Check if strategy was stopped
      if (self._isStopped) {
        self.params.logger.info("ClientStrategy backtest user-activated signal cancelled (stopped)", {
          symbol: self.params.execution.context.symbol,
          signalId: activatedSignal.id,
        });
        await self.setScheduledSignal(null);
        return { activated: false, cancelled: false, activationIndex: i, result: null };
      }

      // Риск-проверка по averagePrice (симметрия с LIVE tick())
      if (
        await not(
          CALL_RISK_CHECK_SIGNAL_FN(
            self,
            self.params.execution.context.symbol,
            activatedSignal,
            averagePrice,
            candle.timestamp,
            self.params.execution.context.backtest
          )
        )
      ) {
        self.params.logger.info("ClientStrategy backtest user-activated signal rejected by risk", {
          symbol: self.params.execution.context.symbol,
          signalId: activatedSignal.id,
        });
        await self.setScheduledSignal(null);
        return { activated: false, cancelled: false, activationIndex: i, result: null };
      }

      const pendingSignal: ISignalRow = {
        ...activatedSignal,
        pendingAt: candle.timestamp,
        _isScheduled: false,
      };

      // Sync open: if external system rejects — cancel scheduled signal instead of opening
      const syncOpenAllowed = await CALL_SIGNAL_SYNC_OPEN_FN(
        candle.timestamp,
        pendingSignal.priceOpen,
        pendingSignal,
        self
      );

      if (!syncOpenAllowed) {
        self.params.logger.info("ClientStrategy backtest user-activated signal rejected by sync", {
          symbol: self.params.execution.context.symbol,
          signalId: activatedSignal.id,
        });
        await self.setScheduledSignal(null);
        await CALL_COMMIT_FN(self, {
          action: "cancel-scheduled",
          symbol: self.params.execution.context.symbol,
          strategyName: self.params.strategyName,
          exchangeName: self.params.exchangeName,
          frameName: self.params.frameName,
          signalId: activatedSignal.id,
          backtest: self.params.execution.context.backtest,
          timestamp: candle.timestamp,
          totalEntries: activatedSignal._entry?.length ?? 1,
          totalPartials: activatedSignal._partial?.length ?? 0,
          originalPriceOpen: activatedSignal.priceOpen,
          pnl: toProfitLossDto(activatedSignal, averagePrice),
        });
        return { activated: false, cancelled: true, activationIndex: i, result: null };
      }

      await self.setScheduledSignal(null);

      await self.setPendingSignal(pendingSignal);

      await CALL_RISK_ADD_SIGNAL_FN(
        self,
        self.params.execution.context.symbol,
        pendingSignal,
        candle.timestamp,
        self.params.execution.context.backtest
      );

      // Emit commit AFTER successful risk check
      const publicSignalForCommit = TO_PUBLIC_SIGNAL(pendingSignal, averagePrice);
      await CALL_COMMIT_FN(self, {
        action: "activate-scheduled",
        symbol: self.params.execution.context.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        signalId: activatedSignal.id,
        backtest: self.params.execution.context.backtest,
        activateId: activatedSignal.activateId,
        timestamp: candle.timestamp,
        currentPrice: averagePrice,
        pnl: toProfitLossDto(pendingSignal, averagePrice),
        position: publicSignalForCommit.position,
        priceOpen: publicSignalForCommit.priceOpen,
        priceTakeProfit: publicSignalForCommit.priceTakeProfit,
        priceStopLoss: publicSignalForCommit.priceStopLoss,
        originalPriceTakeProfit: publicSignalForCommit.originalPriceTakeProfit,
        originalPriceStopLoss: publicSignalForCommit.originalPriceStopLoss,
        originalPriceOpen: publicSignalForCommit.originalPriceOpen,
        scheduledAt: publicSignalForCommit.scheduledAt,
        pendingAt: publicSignalForCommit.pendingAt,
        totalEntries: publicSignalForCommit.totalEntries,
        totalPartials: publicSignalForCommit.totalPartials,
      });

      await CALL_OPEN_CALLBACKS_FN(
        self,
        self.params.execution.context.symbol,
        pendingSignal,
        pendingSignal.priceOpen,
        candle.timestamp,
        self.params.execution.context.backtest
      );

      await CALL_BACKTEST_SCHEDULE_OPEN_FN(
        self,
        self.params.execution.context.symbol,
        pendingSignal,
        candle.timestamp,
        self.params.execution.context.backtest
      );

      return {
        activated: true,
        cancelled: false,
        activationIndex: i,
        result: null,
      };
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

    await CALL_SCHEDULE_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, scheduled, candle.timestamp, true, averagePrice);

    // Process queued commit events with candle timestamp
    await PROCESS_COMMIT_QUEUE_FN(self, averagePrice, candle.timestamp);
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

    await CALL_ACTIVE_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, signal, currentCandleTimestamp, true, averagePrice);

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
      const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
      if (signal.position === "long") {
        // For long: calculate progress towards TP or SL
        const currentDistance = averagePrice - effectivePriceOpen;

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
          const tpDistance = effectiveTakeProfit - effectivePriceOpen;
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
          const slDistance = effectivePriceOpen - effectiveStopLoss;
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
        const currentDistance = effectivePriceOpen - averagePrice;

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
          const tpDistance = effectivePriceOpen - effectiveTakeProfit;
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
          const slDistance = effectiveStopLoss - effectivePriceOpen;
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

    // Process queued commit events with candle timestamp
    await PROCESS_COMMIT_QUEUE_FN(self, averagePrice, currentCandleTimestamp);
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
  _closedSignal: ISignalCloseRow | null = null;
  _activatedSignal: IScheduledSignalActivateRow | null = null;

  /** Queue for commit events to be processed in tick()/backtest() with proper timestamp */
  _commitQueue: ICommitRow[] = [];

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
   * Checks if there is a pending signal.
   *
   * @param symbol - Trading symbol to check for pending signal
   * @returns Promise resolving to true if a pending signal exists, false otherwise
   */
  public async hasPendingSignal(symbol: string): Promise<boolean> {
    this.params.logger.debug("ClientStrategy hasPendingSignal", {
      symbol,
    });
    return this._pendingSignal !== null;
  }

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

    // КРИТИЧНО: Очищаем флаг закрытия при любом изменении pending signal
    // - при null: сигнал закрыт по TP/SL/timeout, флаг больше не нужен
    // - при новом сигнале: флаг от предыдущего сигнала не должен влиять на новый
    this._closedSignal = null;

    // ЗАЩИТА ИНВАРИАНТА: При установке нового pending сигнала очищаем scheduled
    // Не может быть одновременно pending И scheduled (взаимоисключающие состояния)
    // При null: scheduled может существовать (новый сигнал после закрытия позиции)
    if (pendingSignal !== null) {
      this._scheduledSignal = null;
    }

    this._pendingSignal = pendingSignal;

    // КРИТИЧНО: Всегда вызываем коллбек onWrite для тестирования persist storage
    // даже в backtest режиме, чтобы тесты могли перехватывать вызовы через mock adapter
    if (this.params.callbacks?.onWrite) {
      const publicSignal = this._pendingSignal ? this._pendingSignal : null;
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

    // КРИТИЧНО: Очищаем флаги отмены и активации при любом изменении scheduled signal
    // - при null: сигнал отменен/активирован по timeout/SL/user, флаги больше не нужны
    // - при новом сигнале: флаги от предыдущего сигнала не должны влиять на новый
    this._cancelledSignal = null;
    this._activatedSignal = null;

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
  public async getPendingSignal(symbol: string, currentPrice: number): Promise<IPublicSignalRow | null> {
    this.params.logger.debug("ClientStrategy getPendingSignal", {
      symbol,
    });
    return this._pendingSignal ? TO_PUBLIC_SIGNAL(this._pendingSignal, currentPrice) : null;
  }

  /**
   * Retrieves the current scheduled signal.
   * If no scheduled signal exists, returns null.
   * @returns Promise resolving to the scheduled signal or null.
   */
  public async getScheduledSignal(symbol: string, currentPrice: number): Promise<IPublicSignalRow | null> {
    this.params.logger.debug("ClientStrategy getScheduledSignal", {
      symbol,
    });
    return this._scheduledSignal ? TO_PUBLIC_SIGNAL(this._scheduledSignal, currentPrice) : null;
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
    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);

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
        const isPositiveTrailing = trailingStopLoss > effectivePriceOpen;

        if (isPositiveTrailing) {
          // Trailing stop is already protecting profit - breakeven achieved
          return true;
        }

        // Trailing stop is negative (below entry)
        // Check if we can upgrade it to breakeven
        const thresholdPrice = effectivePriceOpen * (1 + breakevenThresholdPercent / 100);
        const isThresholdReached = currentPrice >= thresholdPrice;
        const breakevenPrice = effectivePriceOpen;

        // Can upgrade to breakeven if threshold reached and breakeven is better than current trailing SL
        return isThresholdReached && breakevenPrice > trailingStopLoss;
      } else {
        // SHORT: trailing SL is positive if it's below entry (in profit zone)
        const isPositiveTrailing = trailingStopLoss < effectivePriceOpen;

        if (isPositiveTrailing) {
          // Trailing stop is already protecting profit - breakeven achieved
          return true;
        }

        // Trailing stop is negative (above entry)
        // Check if we can upgrade it to breakeven
        const thresholdPrice = effectivePriceOpen * (1 - breakevenThresholdPercent / 100);
        const isThresholdReached = currentPrice <= thresholdPrice;
        const breakevenPrice = effectivePriceOpen;

        // Can upgrade to breakeven if threshold reached and breakeven is better than current trailing SL
        return isThresholdReached && breakevenPrice < trailingStopLoss;
      }
    }

    // No trailing stop set - proceed with normal breakeven logic
    const currentStopLoss = signal.priceStopLoss;
    const breakevenPrice = effectivePriceOpen;

    // Calculate threshold price
    let thresholdPrice: number;
    let isThresholdReached: boolean;
    let canMoveToBreakeven: boolean;

    if (signal.position === "long") {
      // LONG: threshold reached when price goes UP by breakevenThresholdPercent from entry
      thresholdPrice = effectivePriceOpen * (1 + breakevenThresholdPercent / 100);
      isThresholdReached = currentPrice >= thresholdPrice;

      // Can move to breakeven only if threshold reached and SL is below entry
      canMoveToBreakeven = isThresholdReached && currentStopLoss < breakevenPrice;
    } else {
      // SHORT: threshold reached when price goes DOWN by breakevenThresholdPercent from entry
      thresholdPrice = effectivePriceOpen * (1 - breakevenThresholdPercent / 100);
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
   * Returns how much of the position is still held, as a percentage of totalInvested.
   *
   * Uses dollar-basis cost-basis replay (DCA-aware).
   * 100% means nothing was closed yet. Decreases with each partial close.
   *
   * Example: 1 entry $100, partialProfit(30%) → returns 70
   * Example: 2 entries $200, partialProfit(50%) → returns 50
   *
   * Returns 100 if no pending signal or no partial closes.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to held percentage (0–100)
   */
  public async getTotalPercentClosed(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getTotalPercentClosed", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    const { totalClosedPercent } = getTotalClosed(this._pendingSignal);
    return 100 - totalClosedPercent;
  }

  /**
   * Returns how many dollars of cost basis are still held (not yet closed by partials).
   *
   * Equal to remainingCostBasis from getTotalClosed.
   * Full position open: equals totalInvested (entries × $100).
   * Decreases with each partial close, increases with each averageBuy().
   *
   * Example: 1 entry $100, no partials → returns 100
   * Example: 1 entry $100, partialProfit(30%) → returns 70
   * Example: 2 entries $200, partialProfit(50%) → returns 100
   *
   * Returns totalInvested if no pending signal or no partial closes.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to held cost basis in dollars
   */
  public async getTotalCostClosed(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getTotalCostClosed", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    const { remainingCostBasis } = getTotalClosed(this._pendingSignal);
    return remainingCostBasis;
  }

  /**
   * Returns the effective (DCA-averaged) entry price for the current pending signal.
   *
   * This is the harmonic mean of all _entry prices, which is the correct
   * cost-basis price used in all PNL calculations.
   * With no DCA entries, equals the original priceOpen.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to effective entry price or null
   */
  public async getPositionAveragePrice(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionAveragePrice", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return GET_EFFECTIVE_PRICE_OPEN(this._pendingSignal);
  }

  /**
   * Returns the number of DCA entries made for the current pending signal.
   *
   * 1 = original entry only (no DCA).
   * Increases by 1 with each successful commitAverageBuy().
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to entry count or null
   */
  public async getPositionInvestedCount(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionInvestedCount", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._entry?.length ?? 1;
  }

  /**
   * Returns the total invested cost basis in dollars for the current pending signal.
   *
   * Equal to entryCount × $100 (COST_BASIS_PER_ENTRY).
   * 1 entry = $100, 2 entries = $200, etc.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to total invested cost in dollars or null
   */
  public async getPositionInvestedCost(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionInvestedCost", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return (this._pendingSignal._entry ?? []).reduce((s, e) => s + e.cost, 0) || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST;
  }

  /**
   * Returns the unrealized PNL percentage for the current pending signal at currentPrice.
   *
   * Accounts for partial closes, DCA entries, slippage and fees
   * (delegates to toProfitLossDto).
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @returns Promise resolving to pnlPercentage or null
   */
  public async getPositionPnlPercent(symbol: string, currentPrice: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionPnlPercent", { symbol, currentPrice });
    if (!this._pendingSignal) {
      return null;
    }
    const pnl = toProfitLossDto(this._pendingSignal, currentPrice);
    return pnl.pnlPercentage;
  }

  /**
   * Returns the unrealized PNL in dollars for the current pending signal at currentPrice.
   *
   * Calculated as: pnlPercentage / 100 × totalInvestedCost
   * Accounts for partial closes, DCA entries, slippage and fees.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @returns Promise resolving to pnl in dollars or null
   */
  public async getPositionPnlCost(symbol: string, currentPrice: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionPnlCost", { symbol, currentPrice });
    if (!this._pendingSignal) {
      return null;
    }
    const pnl = toProfitLossDto(this._pendingSignal, currentPrice);
    return pnl.pnlCost;
  }

  /**
   * Returns the list of DCA entry prices for the current pending signal.
   *
   * The first element is always the original priceOpen (initial entry).
   * Each subsequent element is a price added by commitAverageBuy().
   *
   * Returns null if no pending signal exists.
   * Returns a single-element array [priceOpen] if no DCA entries were made.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to array of entry prices or null
   *
   * @example
   * // No DCA: [43000]
   * // One DCA: [43000, 42000]
   * // Two DCA: [43000, 42000, 41500]
   */
  public async getPositionLevels(symbol: string): Promise<number[] | null> {
    this.params.logger.debug("ClientStrategy getPositionLevels", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    const entries = this._pendingSignal._entry;
    if (!entries || entries.length === 0) {
      return [this._pendingSignal.priceOpen];
    }
    return entries.map((e) => e.price);
  }

  public async getPositionPartials(symbol: string): Promise<Partials> | null {
    this.params.logger.debug("ClientStrategy getPositionPartials", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._partial ?? [];
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

    const currentPrice = await this.params.exchange.getAveragePrice(
      this.params.execution.context.symbol
    );

    // Process queued commit events with proper timestamp
    await PROCESS_COMMIT_QUEUE_FN(this, currentTime, currentPrice);

    // Check if scheduled signal was cancelled - emit cancelled event once
    // NOTE: No _isStopped check here - cancellation must work for graceful shutdown
    if (this._cancelledSignal) {
      const cancelledSignal = this._cancelledSignal;
      this._cancelledSignal = null; // Clear after emitting

      this.params.logger.info("ClientStrategy tick: scheduled signal was cancelled", {
        symbol: this.params.execution.context.symbol,
        signalId: cancelledSignal.id,
      });

      // Emit commit with correct timestamp from tick context
      await CALL_COMMIT_FN(this, {
        action: "cancel-scheduled",
        symbol: this.params.execution.context.symbol,
        strategyName: this.params.strategyName,
        exchangeName: this.params.exchangeName,
        frameName: this.params.frameName,
        signalId: cancelledSignal.id,
        backtest: this.params.execution.context.backtest,
        cancelId: cancelledSignal.cancelId,
        timestamp: currentTime,
        totalEntries: cancelledSignal._entry?.length ?? 1,
        totalPartials: cancelledSignal._partial?.length ?? 0,
        originalPriceOpen: cancelledSignal.priceOpen,
        pnl: toProfitLossDto(cancelledSignal, currentPrice),
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
        signal: TO_PUBLIC_SIGNAL(cancelledSignal, currentPrice),
        currentPrice,
        closeTimestamp: currentTime,
        strategyName: this.params.method.context.strategyName,
        exchangeName: this.params.method.context.exchangeName,
        frameName: this.params.method.context.frameName,
        symbol: this.params.execution.context.symbol,
        backtest: this.params.execution.context.backtest,
        reason: "user",
        cancelId: cancelledSignal.cancelId,
        createdAt: currentTime,
      };

      await CALL_TICK_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        result,
        currentTime,
        this.params.execution.context.backtest
      );

      return result;
    }

    // Check if pending signal was closed - emit closed event once
    if (this._closedSignal) {
      const closedSignal = this._closedSignal;

      // Sync close: if external system rejects — keep _closedSignal, retry on next tick
      const syncCloseAllowed = await CALL_SIGNAL_SYNC_CLOSE_FN(
        currentTime,
        currentPrice,
        "closed",
        closedSignal,
        this
      );

      if (!syncCloseAllowed) {
        this.params.logger.info("ClientStrategy tick: user-closed signal rejected by sync, will retry", {
          symbol: this.params.execution.context.symbol,
          signalId: closedSignal.id,
        });
        // Do NOT clear _closedSignal — retry on next tick
        return await RETURN_IDLE_FN(this, currentPrice);
      }

      this._closedSignal = null; // Clear only after sync confirmed

      this.params.logger.info("ClientStrategy tick: pending signal was closed", {
        symbol: this.params.execution.context.symbol,
        signalId: closedSignal.id,
      });

      // Emit commit with correct timestamp from tick context
      await CALL_COMMIT_FN(this, {
        action: "close-pending",
        symbol: this.params.execution.context.symbol,
        strategyName: this.params.strategyName,
        exchangeName: this.params.exchangeName,
        frameName: this.params.frameName,
        signalId: closedSignal.id,
        backtest: this.params.execution.context.backtest,
        closeId: closedSignal.closeId,
        timestamp: currentTime,
        totalEntries: closedSignal._entry?.length ?? 1,
        totalPartials: closedSignal._partial?.length ?? 0,
        originalPriceOpen: closedSignal.priceOpen,
        pnl: toProfitLossDto(closedSignal, currentPrice),
      });

      // Call onClose callback
      await CALL_CLOSE_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        closedSignal,
        currentPrice,
        currentTime,
        this.params.execution.context.backtest
      );

      // КРИТИЧНО: Очищаем состояние ClientPartial при закрытии позиции
      await CALL_PARTIAL_CLEAR_FN(
        this,
        this.params.execution.context.symbol,
        closedSignal,
        currentPrice,
        currentTime,
        this.params.execution.context.backtest
      );

      // КРИТИЧНО: Очищаем состояние ClientBreakeven при закрытии позиции
      await CALL_BREAKEVEN_CLEAR_FN(
        this,
        this.params.execution.context.symbol,
        closedSignal,
        currentPrice,
        currentTime,
        this.params.execution.context.backtest
      );

      await CALL_RISK_REMOVE_SIGNAL_FN(
        this,
        this.params.execution.context.symbol,
        currentTime,
        this.params.execution.context.backtest
      );

      const pnl = toProfitLossDto(closedSignal, currentPrice);

      const result: IStrategyTickResultClosed = {
        action: "closed",
        signal: TO_PUBLIC_SIGNAL(closedSignal, currentPrice),
        currentPrice,
        closeReason: "closed",
        closeTimestamp: currentTime,
        pnl,
        strategyName: this.params.method.context.strategyName,
        exchangeName: this.params.method.context.exchangeName,
        frameName: this.params.method.context.frameName,
        symbol: this.params.execution.context.symbol,
        backtest: this.params.execution.context.backtest,
        closeId: closedSignal.closeId,
        createdAt: currentTime,
      };

      await CALL_TICK_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        result,
        currentTime,
        this.params.execution.context.backtest
      );

      return result;
    }

    // Check if scheduled signal was activated - emit opened event once
    if (this._activatedSignal) {
      const currentPrice = await this.params.exchange.getAveragePrice(
        this.params.execution.context.symbol
      );

      const activatedSignal = this._activatedSignal;
      this._activatedSignal = null; // Clear after emitting

      this.params.logger.info("ClientStrategy tick: scheduled signal was activated", {
        symbol: this.params.execution.context.symbol,
        signalId: activatedSignal.id,
      });

      // Check if strategy was stopped (symmetry with backtest PROCESS_SCHEDULED_SIGNAL_CANDLES_FN)
      if (this._isStopped) {
        this.params.logger.info("ClientStrategy tick: user-activated signal cancelled (stopped)", {
          symbol: this.params.execution.context.symbol,
          signalId: activatedSignal.id,
        });
        await this.setScheduledSignal(null);
        return await RETURN_IDLE_FN(this, currentPrice);
      }

      // Check risk before activation
      if (
        await not(
          CALL_RISK_CHECK_SIGNAL_FN(
            this,
            this.params.execution.context.symbol,
            activatedSignal,
            currentPrice,
            currentTime,
            this.params.execution.context.backtest
          )
        )
      ) {
        this.params.logger.info("ClientStrategy tick: activated signal rejected by risk", {
          symbol: this.params.execution.context.symbol,
          signalId: activatedSignal.id,
        });
        return await RETURN_IDLE_FN(this, currentPrice);
      }

      // КРИТИЧЕСКИ ВАЖНО: обновляем pendingAt при активации
      const pendingSignal: ISignalRow = {
        ...activatedSignal,
        pendingAt: currentTime,
        _isScheduled: false,
      };

      const syncOpenAllowed = await CALL_SIGNAL_SYNC_OPEN_FN(currentTime, currentPrice, pendingSignal, this);
      if (!syncOpenAllowed) {
        this.params.logger.info("ClientStrategy tick: user-activated signal rejected by sync", {
          symbol: this.params.execution.context.symbol,
          signalId: activatedSignal.id,
        });
        await this.setScheduledSignal(null);
        await CALL_COMMIT_FN(this, {
          action: "cancel-scheduled",
          symbol: this.params.execution.context.symbol,
          strategyName: this.params.strategyName,
          exchangeName: this.params.exchangeName,
          frameName: this.params.frameName,
          signalId: activatedSignal.id,
          backtest: this.params.execution.context.backtest,
          timestamp: currentTime,
          totalEntries: activatedSignal._entry?.length ?? 1,
          totalPartials: activatedSignal._partial?.length ?? 0,
          originalPriceOpen: activatedSignal.priceOpen,
          pnl: toProfitLossDto(activatedSignal, currentPrice),
        });
        return await RETURN_IDLE_FN(this, currentPrice);
      }

      await this.setPendingSignal(pendingSignal);

      await CALL_RISK_ADD_SIGNAL_FN(
        this,
        this.params.execution.context.symbol,
        pendingSignal,
        currentTime,
        this.params.execution.context.backtest
      );

      // Emit commit AFTER successful risk check
      const publicSignalForCommit = TO_PUBLIC_SIGNAL(pendingSignal, currentPrice);
      await CALL_COMMIT_FN(this, {
        action: "activate-scheduled",
        symbol: this.params.execution.context.symbol,
        strategyName: this.params.strategyName,
        exchangeName: this.params.exchangeName,
        frameName: this.params.frameName,
        signalId: activatedSignal.id,
        backtest: this.params.execution.context.backtest,
        activateId: activatedSignal.activateId,
        timestamp: currentTime,
        currentPrice,
        pnl: toProfitLossDto(pendingSignal, currentPrice),
        position: publicSignalForCommit.position,
        priceOpen: publicSignalForCommit.priceOpen,
        priceTakeProfit: publicSignalForCommit.priceTakeProfit,
        priceStopLoss: publicSignalForCommit.priceStopLoss,
        originalPriceTakeProfit: publicSignalForCommit.originalPriceTakeProfit,
        originalPriceStopLoss: publicSignalForCommit.originalPriceStopLoss,
        originalPriceOpen: publicSignalForCommit.originalPriceOpen,
        scheduledAt: publicSignalForCommit.scheduledAt,
        pendingAt: publicSignalForCommit.pendingAt,
        totalEntries: publicSignalForCommit.totalEntries,
        totalPartials: publicSignalForCommit.totalPartials,
      });

      // Call onOpen callback
      await CALL_OPEN_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        pendingSignal,
        currentPrice,
        currentTime,
        this.params.execution.context.backtest
      );

      const result: IStrategyTickResultOpened = {
        action: "opened",
        signal: TO_PUBLIC_SIGNAL(pendingSignal, currentPrice),
        strategyName: this.params.method.context.strategyName,
        exchangeName: this.params.method.context.exchangeName,
        frameName: this.params.method.context.frameName,
        symbol: this.params.execution.context.symbol,
        currentPrice,
        backtest: this.params.execution.context.backtest,
        createdAt: currentTime,
      };

      await CALL_TICK_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        result,
        currentTime,
        this.params.execution.context.backtest
      );

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
    // NOTE: _isStopped blocks NEW signal generation but allows existing positions to continue
    if (!this._pendingSignal && !this._scheduledSignal) {
      if (this._isStopped) {
        const currentPrice = await this.params.exchange.getAveragePrice(
          this.params.execution.context.symbol
        );
        return await RETURN_IDLE_FN(this, currentPrice);
      }

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
  ): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled> {
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

      // Emit commit with correct timestamp from backtest context
      await CALL_COMMIT_FN(this, {
        action: "cancel-scheduled",
        symbol: this.params.execution.context.symbol,
        strategyName: this.params.strategyName,
        exchangeName: this.params.exchangeName,
        frameName: this.params.frameName,
        signalId: cancelledSignal.id,
        backtest: true,
        cancelId: cancelledSignal.cancelId,
        timestamp: closeTimestamp,
        totalEntries: cancelledSignal._entry?.length ?? 1,
        totalPartials: cancelledSignal._partial?.length ?? 0,
        originalPriceOpen: cancelledSignal.priceOpen,
        pnl: toProfitLossDto(cancelledSignal, currentPrice),
      });

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
        signal: TO_PUBLIC_SIGNAL(cancelledSignal, currentPrice),
        currentPrice,
        closeTimestamp: closeTimestamp,
        strategyName: this.params.method.context.strategyName,
        exchangeName: this.params.method.context.exchangeName,
        frameName: this.params.method.context.frameName,
        symbol: this.params.execution.context.symbol,
        backtest: true,
        reason: "user",
        cancelId: cancelledSignal.cancelId,
        createdAt: closeTimestamp,
      };

      await CALL_TICK_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        cancelledResult,
        closeTimestamp,
        this.params.execution.context.backtest
      );

      return cancelledResult;
    }

    // If signal was closed - return closed
    if (this._closedSignal) {
      this.params.logger.debug("ClientStrategy backtest: pending signal was closed");

      const currentPrice = await this.params.exchange.getAveragePrice(symbol);

      const closedSignal = this._closedSignal;

      const closeTimestamp = this.params.execution.context.when.getTime();

      // Sync close: if external system rejects — restore _pendingSignal, retry on next backtest() call
      const syncCloseAllowed = await CALL_SIGNAL_SYNC_CLOSE_FN(
        closeTimestamp,
        currentPrice,
        "closed",
        closedSignal,
        this
      );

      if (!syncCloseAllowed) {
        this.params.logger.info("ClientStrategy backtest: user-closed signal rejected by sync, will retry", {
          symbol: this.params.execution.context.symbol,
          signalId: closedSignal.id,
        });
        // Restore _pendingSignal so next backtest() call can process it normally
        this._closedSignal = null;
        this._pendingSignal = closedSignal;
        throw new Error(
          `ClientStrategy backtest: signal close rejected by sync (signalId=${closedSignal.id}). ` +
          `Retry backtest() with new candle data.`
        );
      }

      this._closedSignal = null; // Clear only after sync confirmed

      // Emit commit with correct timestamp from backtest context
      await CALL_COMMIT_FN(this, {
        action: "close-pending",
        symbol: this.params.execution.context.symbol,
        strategyName: this.params.strategyName,
        exchangeName: this.params.exchangeName,
        frameName: this.params.frameName,
        signalId: closedSignal.id,
        backtest: true,
        closeId: closedSignal.closeId,
        timestamp: closeTimestamp,
        totalEntries: closedSignal._entry?.length ?? 1,
        totalPartials: closedSignal._partial?.length ?? 0,
        originalPriceOpen: closedSignal.priceOpen,
        pnl: toProfitLossDto(closedSignal, currentPrice),
      });

      await CALL_CLOSE_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        closedSignal,
        currentPrice,
        closeTimestamp,
        this.params.execution.context.backtest
      );

      // КРИТИЧНО: Очищаем состояние ClientPartial при закрытии позиции
      await CALL_PARTIAL_CLEAR_FN(
        this,
        this.params.execution.context.symbol,
        closedSignal,
        currentPrice,
        closeTimestamp,
        this.params.execution.context.backtest
      );

      // КРИТИЧНО: Очищаем состояние ClientBreakeven при закрытии позиции
      await CALL_BREAKEVEN_CLEAR_FN(
        this,
        this.params.execution.context.symbol,
        closedSignal,
        currentPrice,
        closeTimestamp,
        this.params.execution.context.backtest
      );

      await CALL_RISK_REMOVE_SIGNAL_FN(
        this,
        this.params.execution.context.symbol,
        closeTimestamp,
        this.params.execution.context.backtest
      );

      const pnl = toProfitLossDto(closedSignal, currentPrice);

      const closedResult: IStrategyTickResultClosed = {
        action: "closed",
        signal: TO_PUBLIC_SIGNAL(closedSignal, currentPrice),
        currentPrice,
        closeReason: "closed",
        closeTimestamp: closeTimestamp,
        pnl,
        strategyName: this.params.method.context.strategyName,
        exchangeName: this.params.method.context.exchangeName,
        frameName: this.params.method.context.frameName,
        symbol: this.params.execution.context.symbol,
        backtest: true,
        closeId: closedSignal.closeId,
        createdAt: closeTimestamp,
      };

      await CALL_TICK_CALLBACKS_FN(
        this,
        this.params.execution.context.symbol,
        closedResult,
        closeTimestamp,
        this.params.execution.context.backtest
      );

      return closedResult;
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
        // КРИТИЧНО: activationIndex - индекс свечи активации в массиве candles
        // BacktestLogicPrivateService включил буфер в начало массива, поэтому перед activationIndex достаточно свечей
        // PROCESS_PENDING_SIGNAL_CANDLES_FN пропустит первые bufferCandlesCount свечей для VWAP
        // Чтобы обработка началась со СЛЕДУЮЩЕЙ свечи после активации (activationIndex + 1),
        // нужно взять срез начиная с (activationIndex + 1 - bufferCandlesCount)
        // Это даст буфер ИЗ scheduled фазы + свеча после активации как первая обрабатываемая
        const bufferCandlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - 1;
        const sliceStart = Math.max(0, activationIndex + 1 - bufferCandlesCount);
        const remainingCandles = candles.slice(sliceStart);

        if (remainingCandles.length === 0) {
          const candlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;
          const recentCandles = candles.slice(
            Math.max(0, activationIndex - (candlesCount - 1)),
            activationIndex + 1
          );
          const lastPrice = GET_AVG_PRICE_FN(recentCandles);
          const closeTimestamp = candles[activationIndex].timestamp;

          const noRemainingResult = await CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN(
            this,
            scheduled,
            lastPrice,
            "time_expired",
            closeTimestamp
          );

          if (!noRemainingResult) {
            throw new Error(
              `ClientStrategy backtest: time_expired close rejected by sync (signalId=${scheduled.id}). ` +
              `Retry backtest() with new candle data.`
            );
          }

          return noRemainingResult;
        }

        candles = remainingCandles;
      }

      if (this._scheduledSignal) {
        // Check if timeout reached (CC_SCHEDULE_AWAIT_MINUTES from scheduledAt)
        const maxTimeToWait = GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES * 60 * 1000;
        const lastCandleTimestamp = candles[candles.length - 1].timestamp;
        const elapsedTime = lastCandleTimestamp - scheduled.scheduledAt;

        if (elapsedTime < maxTimeToWait) {
          // EDGE CASE: backtest() called with partial candle data (should never happen in production)
          // In real backtest flow this won't happen as we process all candles at once
          // This indicates incorrect usage of backtest() - throw error instead of returning partial result
          const bufferCandlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - 1;
          // For scheduled signal that has NOT activated: buffer + wait time only (no lifetime yet)
          const requiredCandlesCount = bufferCandlesCount + GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES + 1;
          throw new Error(
            str.newline(
              `ClientStrategy backtest: Insufficient candle data for scheduled signal (not yet activated). ` +
              `Signal scheduled at ${new Date(scheduled.scheduledAt).toISOString()}, ` +
              `last candle at ${new Date(lastCandleTimestamp).toISOString()}. ` +
              `Elapsed: ${Math.floor(elapsedTime / 60000)}min of ${GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES}min wait time. ` +
              `Provided ${candles.length} candles, but need at least ${requiredCandlesCount} candles. ` +
              `\nBreakdown: ` +
              `${bufferCandlesCount} buffer (VWAP) + ` +
              `${GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES} wait (for activation) = ${requiredCandlesCount} total. ` +
              `\nBuffer explanation: VWAP calculation requires ${GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT} candles, ` +
              `so first ${bufferCandlesCount} candles are skipped during scheduled phase processing. ` +
              `Provide complete candle range: [scheduledAt - ${bufferCandlesCount}min, scheduledAt + ${GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES}min].`
            )
          );
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

    // Signal didn't close during candle processing - check if we have enough data
    const lastCandles = candles.slice(-GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT);
    const lastPrice = GET_AVG_PRICE_FN(lastCandles);
    const closeTimestamp = lastCandles[lastCandles.length - 1].timestamp;

    const signalTime = signal.pendingAt;
    const maxTimeToWait = signal.minuteEstimatedTime * 60 * 1000;
    const elapsedTime = closeTimestamp - signalTime;

    // Check if we actually reached time expiration or just ran out of candles
    if (elapsedTime < maxTimeToWait) {
      // EDGE CASE: backtest() called with insufficient candle data
      const bufferCandlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - 1;
      const requiredCandlesCount = signal.minuteEstimatedTime + bufferCandlesCount + 1;
      throw new Error(
        str.newline(
          `ClientStrategy backtest: Insufficient candle data for pending signal. ` +
          `Signal opened at ${new Date(signal.pendingAt).toISOString()}, ` +
          `last candle at ${new Date(closeTimestamp).toISOString()}. ` +
          `Elapsed: ${Math.floor(elapsedTime / 60000)}min of ${signal.minuteEstimatedTime}min required. ` +
          `Provided ${candles.length} candles, but need at least ${requiredCandlesCount} candles. ` +
          `\nBreakdown: ${signal.minuteEstimatedTime} candles for signal lifetime + ${bufferCandlesCount} buffer candles. ` +
          `\nBuffer explanation: VWAP calculation requires ${GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT} candles, ` +
          `so first ${bufferCandlesCount} candles are skipped to ensure accurate price averaging. ` +
          `Provide complete candle range: [pendingAt - ${bufferCandlesCount}min, pendingAt + ${signal.minuteEstimatedTime}min].`
        )
      );
    }

    // Time actually expired - close with time_expired
    const timeExpiredResult = await CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN(
      this,
      signal,
      lastPrice,
      "time_expired",
      closeTimestamp
    );

    if (!timeExpiredResult) {
      // Sync rejected the close — signal remains in _pendingSignal, caller must retry
      throw new Error(
        `ClientStrategy backtest: time_expired close rejected by sync (signalId=${signal.id}). ` +
        `Retry backtest() with new candle data.`
      );
    }

    return timeExpiredResult;
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
   * await strategy.stopStrategy();
   * // Existing signal will continue until natural close
   * ```
   */
  public async stopStrategy(symbol: string, backtest: boolean): Promise<void> {
    this.params.logger.debug("ClientStrategy stopStrategy", {
      symbol,
      hasPendingSignal: this._pendingSignal !== null,
      hasScheduledSignal: this._scheduledSignal !== null,
      hasActivatedSignal: this._activatedSignal !== null,
      hasCancelledSignal: this._cancelledSignal !== null,
      hasClosedSignal: this._closedSignal !== null,
    });

    this._isStopped = true;

    // Clear pending flags to start from clean state
    // NOTE: _isStopped blocks NEW position opening, but allows:
    // - cancelScheduled() / closePending() for graceful shutdown
    // - Monitoring existing _pendingSignal until TP/SL/timeout
    this._activatedSignal = null;
    this._cancelledSignal = null;
    this._closedSignal = null;

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
   * await strategy.cancelScheduled("BTCUSDT", "my-strategy", false);
   * // Strategy continues, can generate new signals
   * ```
   */
  public async cancelScheduled(symbol: string, backtest: boolean, cancelId?: string): Promise<void> {
    this.params.logger.debug("ClientStrategy cancelScheduled", {
      symbol,
      hasScheduledSignal: this._scheduledSignal !== null,
      cancelId,
    });

    // NOTE: No _isStopped check - cancellation must work for graceful shutdown
    // (cancelling scheduled signal is not opening new position)

    // Save cancelled signal for next tick/backtest to emit cancelled event with correct timestamp
    if (this._scheduledSignal) {
      this._cancelledSignal = Object.assign({}, this._scheduledSignal, {
        cancelId,
      });
      this._scheduledSignal = null;
    }

    if (backtest) {
      // Commit will be emitted in backtest() with correct candle timestamp
      return;
    }

    await PersistScheduleAdapter.writeScheduleData(
      this._scheduledSignal,
      symbol,
      this.params.method.context.strategyName,
      this.params.method.context.exchangeName,
    );

    // Commit will be emitted in tick() with correct currentTime
  }

  /**
   * Activates the scheduled signal without waiting for price to reach priceOpen.
   *
   * Forces immediate activation of the scheduled signal at the current price.
   * Does NOT affect active pending signals or strategy operation.
   * Does NOT set stop flag - strategy can continue generating new signals.
   *
   * Use case: User-initiated early activation of a scheduled entry.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param backtest - Whether running in backtest mode
   * @param activateId - Optional identifier for this activation operation
   * @returns Promise that resolves when scheduled signal is activated
   *
   * @example
   * ```typescript
   * // Activate scheduled signal without waiting for priceOpen
   * await strategy.activateScheduled("BTCUSDT", false, "user-activate-123");
   * // Scheduled signal becomes pending signal immediately
   * ```
   */
  public async activateScheduled(symbol: string, backtest: boolean, activateId?: string): Promise<void> {
    this.params.logger.debug("ClientStrategy activateScheduled", {
      symbol,
      hasScheduledSignal: this._scheduledSignal !== null,
      activateId,
    });

    // Block activation if strategy stopped - activation = opening NEW position
    // (unlike cancelScheduled/closePending which handle existing signals for graceful shutdown)
    if (this._isStopped) {
      this.params.logger.debug("ClientStrategy activateScheduled: strategy stopped, skipping", {
        symbol,
      });
      return;
    }

    // Save activated signal for next tick to emit opened event
    if (this._scheduledSignal) {
      this._activatedSignal = Object.assign({}, this._scheduledSignal, {
        activateId,
      });
      this._scheduledSignal = null;
    }

    if (backtest) {
      // Commit will be emitted AFTER successful risk check in PROCESS_SCHEDULED_SIGNAL_CANDLES_FN
      return;
    }

    await PersistScheduleAdapter.writeScheduleData(
      this._scheduledSignal,
      symbol,
      this.params.method.context.strategyName,
      this.params.method.context.exchangeName,
    );

    // Commit will be emitted AFTER successful risk check in tick()
  }

  /**
   * Closes the pending signal without stopping the strategy.
   *
   * Clears the pending signal (active position).
   * Does NOT affect scheduled signals or strategy operation.
   * Does NOT set stop flag - strategy can continue generating new signals.
   *
   * Use case: Close an active position that is no longer desired without stopping the entire strategy.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param backtest - Whether running in backtest mode
   * @param closeId - Optional identifier for this close operation
   * @returns Promise that resolves when pending signal is cleared
   *
   * @example
   * ```typescript
   * // Close pending signal without stopping strategy
   * await strategy.closePending("BTCUSDT", false, "user-close-123");
   * // Strategy continues, can generate new signals
   * ```
   */
  public async closePending(symbol: string, backtest: boolean, closeId?: string): Promise<void> {
    this.params.logger.debug("ClientStrategy closePending", {
      symbol,
      hasPendingSignal: this._pendingSignal !== null,
      closeId,
    });

    // NOTE: No _isStopped check - closing position must work for graceful shutdown

    // Save closed signal for next tick/backtest to emit closed event with correct timestamp
    if (this._pendingSignal) {
      this._closedSignal = Object.assign({}, this._pendingSignal, {
        closeId,
      });
      this._pendingSignal = null;
    }

    if (backtest) {
      // Commit will be emitted in backtest() with correct candle timestamp
      return;
    }

    await PersistSignalAdapter.writeSignalData(
      this._pendingSignal,
      symbol,
      this.params.strategyName,
      this.params.exchangeName,
    );

    // Commit will be emitted in tick() with correct currentTime
  }

  /**
   * Validates preconditions for partialProfit without mutating state.
   *
   * Returns false (never throws) when any condition would cause partialProfit to fail or skip.
   * Use this to pre-check before calling partialProfit to avoid needing to handle exceptions.
   *
   * @param symbol - Trading pair symbol
   * @param percentToClose - Percentage of position to close (0-100)
   * @param currentPrice - Current market price (must be in profit direction)
   * @returns boolean - true if partialProfit would execute, false otherwise
   */
  public async validatePartialProfit(
    symbol: string,
    percentToClose: number,
    currentPrice: number
  ): Promise<boolean> {
    this.params.logger.debug("ClientStrategy validatePartialProfit", {
      symbol,
      percentToClose,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });

    if (!this._pendingSignal) return false;
    if (typeof percentToClose !== "number" || !isFinite(percentToClose)) return false;
    if (percentToClose <= 0) return false;
    if (percentToClose > 100) return false;
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) return false;

    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(this._pendingSignal);
    if (this._pendingSignal.position === "long" && currentPrice <= effectivePriceOpen) return false;
    if (this._pendingSignal.position === "short" && currentPrice >= effectivePriceOpen) return false;

    const effectiveTakeProfit = this._pendingSignal._trailingPriceTakeProfit ?? this._pendingSignal.priceTakeProfit;
    if (this._pendingSignal.position === "long" && currentPrice >= effectiveTakeProfit) return false;
    if (this._pendingSignal.position === "short" && currentPrice <= effectiveTakeProfit) return false;

    const { totalClosedPercent, remainingCostBasis } = getTotalClosed(this._pendingSignal);
    const totalInvested = (this._pendingSignal._entry ?? []).reduce((s, e) => s + e.cost, 0) || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST;
    const newPartialDollar = (percentToClose / 100) * remainingCostBasis;
    const newTotalClosedDollar = (totalClosedPercent / 100) * totalInvested + newPartialDollar;
    if (newTotalClosedDollar > totalInvested) return false;

    return true;
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
   * - Returns false if total closed would exceed 100%
   * - Returns false if currentPrice already crossed TP level
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
   * @returns Promise<boolean> - true if partial close was executed, false if skipped
   *
   * @example
   * ```typescript
   * // Close 30% of position at profit (moving toward TP)
   * const success1 = await strategy.partialProfit("BTCUSDT", 30, 45000, false);
   * // success1 = true (executed)
   *
   * // Later close another 20%
   * const success2 = await strategy.partialProfit("BTCUSDT", 20, 46000, false);
   * // success2 = true (executed, total 50% closed)
   *
   * // Try to close 60% more (would exceed 100%)
   * const success3 = await strategy.partialProfit("BTCUSDT", 60, 47000, false);
   * // success3 = false (skipped, would exceed 100%)
   * ```
   */
  public async partialProfit(
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    backtest: boolean
  ): Promise<boolean> {
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
    {
      const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(this._pendingSignal);
      if (this._pendingSignal.position === "long") {
        // For LONG: currentPrice must be higher than effectivePriceOpen (moving toward TP)
        if (currentPrice <= effectivePriceOpen) {
          throw new Error(
            `ClientStrategy partialProfit: For LONG position, currentPrice (${currentPrice}) must be > effectivePriceOpen (${effectivePriceOpen})`
          );
        }
      } else {
        // For SHORT: currentPrice must be lower than effectivePriceOpen (moving toward TP)
        if (currentPrice >= effectivePriceOpen) {
          throw new Error(
            `ClientStrategy partialProfit: For SHORT position, currentPrice (${currentPrice}) must be < effectivePriceOpen (${effectivePriceOpen})`
          );
        }
      }
    }

    // Check if currentPrice already crossed take profit level
    const effectiveTakeProfit = this._pendingSignal._trailingPriceTakeProfit ?? this._pendingSignal.priceTakeProfit;

    if (this._pendingSignal.position === "long" && currentPrice >= effectiveTakeProfit) {
      this.params.logger.debug("ClientStrategy partialProfit: price already at/above TP, skipping partial close", {
        signalId: this._pendingSignal.id,
        position: this._pendingSignal.position,
        currentPrice,
        effectiveTakeProfit,
        reason: "currentPrice >= effectiveTakeProfit (LONG position)"
      });
      return false;
    }

    if (this._pendingSignal.position === "short" && currentPrice <= effectiveTakeProfit) {
      this.params.logger.debug("ClientStrategy partialProfit: price already at/below TP, skipping partial close", {
        signalId: this._pendingSignal.id,
        position: this._pendingSignal.position,
        currentPrice,
        effectiveTakeProfit,
        reason: "currentPrice <= effectiveTakeProfit (SHORT position)"
      });
      return false;
    }

    // Execute partial close logic
    const wasExecuted = PARTIAL_PROFIT_FN(this, this._pendingSignal, percentToClose, currentPrice);

    // If partial was not executed (exceeded 100%), return false without persistence
    if (!wasExecuted) {
      return false;
    }

    // Persist updated signal state (inline setPendingSignal content)
    // Note: this._pendingSignal already mutated by PARTIAL_PROFIT_FN, no reassignment needed
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        TO_PUBLIC_SIGNAL(this._pendingSignal, currentPrice),
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

    // Queue commit event for processing in tick()/backtest() with proper timestamp
    this._commitQueue.push({
      action: "partial-profit",
      symbol,
      backtest,
      percentToClose,
      currentPrice,
    });

    return true;
  }

  /**
   * Validates preconditions for partialLoss without mutating state.
   *
   * Returns false (never throws) when any condition would cause partialLoss to fail or skip.
   * Use this to pre-check before calling partialLoss to avoid needing to handle exceptions.
   *
   * @param symbol - Trading pair symbol
   * @param percentToClose - Percentage of position to close (0-100)
   * @param currentPrice - Current market price (must be in loss direction)
   * @returns boolean - true if partialLoss would execute, false otherwise
   */
  public async validatePartialLoss(
    symbol: string,
    percentToClose: number,
    currentPrice: number
  ): Promise<boolean> {
    this.params.logger.debug("ClientStrategy validatePartialLoss", {
      symbol,
      percentToClose,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });

    if (!this._pendingSignal) return false;
    if (typeof percentToClose !== "number" || !isFinite(percentToClose)) return false;
    if (percentToClose <= 0) return false;
    if (percentToClose > 100) return false;
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) return false;

    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(this._pendingSignal);
    if (this._pendingSignal.position === "long" && currentPrice >= effectivePriceOpen) return false;
    if (this._pendingSignal.position === "short" && currentPrice <= effectivePriceOpen) return false;

    const effectiveStopLoss = this._pendingSignal._trailingPriceStopLoss ?? this._pendingSignal.priceStopLoss;
    if (this._pendingSignal.position === "long" && currentPrice <= effectiveStopLoss) return false;
    if (this._pendingSignal.position === "short" && currentPrice >= effectiveStopLoss) return false;

    const { totalClosedPercent, remainingCostBasis } = getTotalClosed(this._pendingSignal);
    const totalInvested = (this._pendingSignal._entry ?? []).reduce((s, e) => s + e.cost, 0) || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST;
    const newPartialDollar = (percentToClose / 100) * remainingCostBasis;
    const newTotalClosedDollar = (totalClosedPercent / 100) * totalInvested + newPartialDollar;
    if (newTotalClosedDollar > totalInvested) return false;

    return true;
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
   * - Returns false if total closed would exceed 100%
   * - Returns false if currentPrice already crossed SL level
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
   * @returns Promise<boolean> - true if partial close was executed, false if skipped
   *
   * @example
   * ```typescript
   * // Close 40% of position at loss (moving toward SL)
   * const success1 = await strategy.partialLoss("BTCUSDT", 40, 38000, false);
   * // success1 = true (executed)
   *
   * // Later close another 30%
   * const success2 = await strategy.partialLoss("BTCUSDT", 30, 37000, false);
   * // success2 = true (executed, total 70% closed)
   *
   * // Try to close 40% more (would exceed 100%)
   * const success3 = await strategy.partialLoss("BTCUSDT", 40, 36000, false);
   * // success3 = false (skipped, would exceed 100%)
   * ```
   */
  public async partialLoss(
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    backtest: boolean
  ): Promise<boolean> {
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
    {
      const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(this._pendingSignal);
      if (this._pendingSignal.position === "long") {
        // For LONG: currentPrice must be lower than effectivePriceOpen (moving toward SL)
        if (currentPrice >= effectivePriceOpen) {
          throw new Error(
            `ClientStrategy partialLoss: For LONG position, currentPrice (${currentPrice}) must be < effectivePriceOpen (${effectivePriceOpen})`
          );
        }
      } else {
        // For SHORT: currentPrice must be higher than effectivePriceOpen (moving toward SL)
        if (currentPrice <= effectivePriceOpen) {
          throw new Error(
            `ClientStrategy partialLoss: For SHORT position, currentPrice (${currentPrice}) must be > effectivePriceOpen (${effectivePriceOpen})`
          );
        }
      }
    }

    // Check if currentPrice already crossed stop loss level
    const effectiveStopLoss = this._pendingSignal._trailingPriceStopLoss ?? this._pendingSignal.priceStopLoss;

    if (this._pendingSignal.position === "long" && currentPrice <= effectiveStopLoss) {
      this.params.logger.debug("ClientStrategy partialLoss: price already at/below SL, skipping partial close", {
        signalId: this._pendingSignal.id,
        position: this._pendingSignal.position,
        currentPrice,
        effectiveStopLoss,
        reason: "currentPrice <= effectiveStopLoss (LONG position)"
      });
      return false;
    }

    if (this._pendingSignal.position === "short" && currentPrice >= effectiveStopLoss) {
      this.params.logger.debug("ClientStrategy partialLoss: price already at/above SL, skipping partial close", {
        signalId: this._pendingSignal.id,
        position: this._pendingSignal.position,
        currentPrice,
        effectiveStopLoss,
        reason: "currentPrice >= effectiveStopLoss (SHORT position)"
      });
      return false;
    }

    // Execute partial close logic
    const wasExecuted = PARTIAL_LOSS_FN(this, this._pendingSignal, percentToClose, currentPrice);

    // If partial was not executed (exceeded 100%), return false without persistence
    if (!wasExecuted) {
      return false;
    }

    // Persist updated signal state (inline setPendingSignal content)
    // Note: this._pendingSignal already mutated by PARTIAL_LOSS_FN, no reassignment needed
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        TO_PUBLIC_SIGNAL(this._pendingSignal, currentPrice),
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

    // Queue commit event for processing in tick()/backtest() with proper timestamp
    this._commitQueue.push({
      action: "partial-loss",
      symbol,
      backtest,
      percentToClose,
      currentPrice,
    });

    return true;
  }

  /**
   * Validates preconditions for breakeven without mutating state.
   *
   * Returns false (never throws) when any condition would cause breakeven to fail or skip.
   * Mirrors the full BREAKEVEN_FN condition logic including threshold, trailing state and intrusion checks.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price to check threshold
   * @returns boolean - true if breakeven would execute, false otherwise
   */
  public async validateBreakeven(
    symbol: string,
    currentPrice: number
  ): Promise<boolean> {
    this.params.logger.debug("ClientStrategy validateBreakeven", {
      symbol,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });
    if (!this._pendingSignal) return false;
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) return false;

    const signal = this._pendingSignal;
    const breakevenPrice = GET_EFFECTIVE_PRICE_OPEN(signal);

    const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
    if (signal.position === "long" && breakevenPrice >= effectiveTakeProfit) return false;
    if (signal.position === "short" && breakevenPrice <= effectiveTakeProfit) return false;

    const breakevenThresholdPercent = (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2;

    if (signal._trailingPriceStopLoss !== undefined) {
      const trailingStopLoss = signal._trailingPriceStopLoss;
      if (signal.position === "long") {
        const isPositiveTrailing = trailingStopLoss > breakevenPrice;
        if (isPositiveTrailing) return true; // already protecting profit
        const thresholdPrice = breakevenPrice * (1 + breakevenThresholdPercent / 100);
        const isThresholdReached = currentPrice >= thresholdPrice;
        if (!isThresholdReached || breakevenPrice <= trailingStopLoss) return false;
        if (currentPrice < breakevenPrice) return false; // price intrusion
        return true;
      } else {
        const isPositiveTrailing = trailingStopLoss < breakevenPrice;
        if (isPositiveTrailing) return true; // already protecting profit
        const thresholdPrice = breakevenPrice * (1 - breakevenThresholdPercent / 100);
        const isThresholdReached = currentPrice <= thresholdPrice;
        if (!isThresholdReached || breakevenPrice >= trailingStopLoss) return false;
        if (currentPrice > breakevenPrice) return false; // price intrusion
        return true;
      }
    }

    const currentStopLoss = signal.priceStopLoss;
    if (signal.position === "long") {
      const thresholdPrice = breakevenPrice * (1 + breakevenThresholdPercent / 100);
      const isThresholdReached = currentPrice >= thresholdPrice;
      const canMove = isThresholdReached && currentStopLoss < breakevenPrice;
      if (!canMove) return false;
      if (currentPrice < breakevenPrice) return false;
    } else {
      const thresholdPrice = breakevenPrice * (1 - breakevenThresholdPercent / 100);
      const isThresholdReached = currentPrice <= thresholdPrice;
      const canMove = isThresholdReached && currentStopLoss > breakevenPrice;
      if (!canMove) return false;
      if (currentPrice > breakevenPrice) return false;
    }

    return true;
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

    // Check for conflict with existing trailing take profit
    const signal = this._pendingSignal;
    const breakevenPrice = GET_EFFECTIVE_PRICE_OPEN(signal);
    const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;

    if (signal.position === "long" && breakevenPrice >= effectiveTakeProfit) {
      // LONG: Breakeven SL would be at or above current TP - invalid configuration
      this.params.logger.debug("ClientStrategy breakeven: SL/TP conflict detected, skipping breakeven", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        breakevenPrice,
        effectiveTakeProfit,
        reason: "breakevenPrice >= effectiveTakeProfit (LONG position)"
      });
      return false;
    }

    if (signal.position === "short" && breakevenPrice <= effectiveTakeProfit) {
      // SHORT: Breakeven SL would be at or below current TP - invalid configuration
      this.params.logger.debug("ClientStrategy breakeven: SL/TP conflict detected, skipping breakeven", {
        signalId: signal.id,
        position: signal.position,
        priceOpen: signal.priceOpen,
        breakevenPrice,
        effectiveTakeProfit,
        reason: "breakevenPrice <= effectiveTakeProfit (SHORT position)"
      });
      return false;
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
      const publicSignal = TO_PUBLIC_SIGNAL(this._pendingSignal, currentPrice);
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

    // Queue commit event for processing in tick()/backtest() with proper timestamp
    this._commitQueue.push({
      action: "breakeven",
      symbol,
      backtest,
      currentPrice,
    });

    return true;
  }

  /**
   * Validates preconditions for trailingStop without mutating state.
   *
   * Returns false (never throws) when any condition would cause trailingStop to fail or skip.
   * Includes absorption check: returns false if new SL would not improve on the current trailing SL.
   *
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage shift of ORIGINAL SL distance [-100, 100], excluding 0
   * @param currentPrice - Current market price to check for intrusion
   * @returns boolean - true if trailingStop would execute, false otherwise
   */
  public async validateTrailingStop(
    symbol: string,
    percentShift: number,
    currentPrice: number
  ): Promise<boolean> {
    this.params.logger.debug("ClientStrategy validateTrailingStop", {
      symbol,
      percentShift,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });

    if (!this._pendingSignal) return false;
    if (typeof percentShift !== "number" || !isFinite(percentShift)) return false;
    if (percentShift < -100 || percentShift > 100) return false;
    if (percentShift === 0) return false;
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) return false;

    const signal = this._pendingSignal;
    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
    const slDistancePercent = Math.abs((effectivePriceOpen - signal.priceStopLoss) / effectivePriceOpen * 100);
    const newSlDistancePercent = slDistancePercent + percentShift;

    let newStopLoss: number;
    if (signal.position === "long") {
      newStopLoss = effectivePriceOpen * (1 - newSlDistancePercent / 100);
    } else {
      newStopLoss = effectivePriceOpen * (1 + newSlDistancePercent / 100);
    }

    // Intrusion check (mirrors trailingStop method: applied before TRAILING_STOP_LOSS_FN, for all calls)
    if (signal.position === "long" && currentPrice < newStopLoss) return false;
    if (signal.position === "short" && currentPrice > newStopLoss) return false;

    const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
    if (signal.position === "long" && newStopLoss >= effectiveTakeProfit) return false;
    if (signal.position === "short" && newStopLoss <= effectiveTakeProfit) return false;

    // Absorption check (mirrors TRAILING_STOP_LOSS_FN: first call is unconditional)
    const currentTrailingSL = signal._trailingPriceStopLoss;
    if (currentTrailingSL !== undefined) {
      if (signal.position === "long" && newStopLoss <= currentTrailingSL) return false;
      if (signal.position === "short" && newStopLoss >= currentTrailingSL) return false;
    }

    return true;
  }

  /**
   * Adjusts trailing stop-loss by shifting distance between entry and original SL.
   *
   * CRITICAL: Always calculates from ORIGINAL SL, not from current trailing SL.
   * This prevents error accumulation on repeated calls.
   * Larger percentShift ABSORBS smaller one (updates only towards better protection).
   *
   * Calculates new SL based on percentage shift of the ORIGINAL distance (entry - originalSL):
   * - Negative %: tightens stop (moves SL closer to entry, reduces risk)
   * - Positive %: loosens stop (moves SL away from entry, allows more drawdown)
   *
   * For LONG position (entry=100, originalSL=90, distance=10%):
   * - percentShift = -50: newSL = 100 - 10%*(1-0.5) = 95 (5% distance, tighter)
   * - percentShift = +20: newSL = 100 - 10%*(1+0.2) = 88 (12% distance, looser)
   *
   * For SHORT position (entry=100, originalSL=110, distance=10%):
   * - percentShift = -50: newSL = 100 + 10%*(1-0.5) = 105 (5% distance, tighter)
   * - percentShift = +20: newSL = 100 + 10%*(1+0.2) = 112 (12% distance, looser)
   *
   * Trailing behavior (absorption):
   * - First call: sets trailing SL unconditionally
   * - Subsequent calls: updates only if new SL is BETTER (protects more profit)
   * - For LONG: only accepts HIGHER SL (never moves down, closer to entry wins)
   * - For SHORT: only accepts LOWER SL (never moves up, closer to entry wins)
   * - Stores in _trailingPriceStopLoss, original priceStopLoss always preserved
   *
   * Example of absorption (LONG, entry=100, originalSL=90):
   * ```typescript
   * await trailingStop(-50, price); // Sets SL=95 (first call)
   * await trailingStop(-30, price); // SKIPPED: SL=97 < 95 (worse, not absorbed)
   * await trailingStop(-70, price); // Sets SL=97 (better, absorbs previous)
   * ```
   *
   * Validation:
   * - Throws if no pending signal exists
   * - Throws if percentShift is not a finite number
   * - Throws if percentShift < -100 or > 100
   * - Throws if percentShift === 0
   * - Throws if currentPrice is not a positive finite number
   * - Skips if new SL would cross entry price
   * - Skips if currentPrice already crossed new SL level (price intrusion protection)
   * - Skips if new SL conflicts with existing trailing take-profit
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentShift - Percentage shift of ORIGINAL SL distance [-100, 100], excluding 0
   * @param currentPrice - Current market price to check for intrusion
   * @param backtest - Whether running in backtest mode (controls persistence)
   * @returns Promise<boolean> - true if trailing SL was set/updated, false if rejected (absorption/intrusion/conflict)
   *
   * @example
   * ```typescript
   * // LONG position: entry=100, originalSL=90, distance=10%, currentPrice=102
   *
   * // Move SL 50% closer to entry (tighten): reduces distance by 50%
   * const success1 = await strategy.trailingStop("BTCUSDT", -50, 102, false);
   * // success1 = true, newDistance = 10% - 50% = 5%, newSL = 100 * (1 - 0.05) = 95
   *
   * // Try to move SL only 30% closer (less aggressive)
   * const success2 = await strategy.trailingStop("BTCUSDT", -30, 102, false);
   * // success2 = false (SKIPPED: newSL=97 < 95, worse protection, larger % absorbs smaller)
   *
   * // Move SL 70% closer to entry (more aggressive)
   * const success3 = await strategy.trailingStop("BTCUSDT", -70, 102, false);
   * // success3 = true, newDistance = 10% - 70% = 3%, newSL = 100 * (1 - 0.03) = 97
   * // Updated! SL=97 > 95 (better protection)
   *
   * // Price intrusion example: currentPrice=92, trying to set SL=95
   * const success4 = await strategy.trailingStop("BTCUSDT", -50, 92, false);
   * // success4 = false (SKIPPED: currentPrice (92) < newSL (95) - would trigger immediate stop)
   * ```
   */
  public async trailingStop(
    symbol: string,
    percentShift: number,
    currentPrice: number,
    backtest: boolean
  ): Promise<boolean> {
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
    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
    const slDistancePercent = Math.abs((effectivePriceOpen - signal.priceStopLoss) / effectivePriceOpen * 100);
    const newSlDistancePercent = slDistancePercent + percentShift;

    let newStopLoss: number;
    if (signal.position === "long") {
      newStopLoss = effectivePriceOpen * (1 - newSlDistancePercent / 100);
    } else {
      newStopLoss = effectivePriceOpen * (1 + newSlDistancePercent / 100);
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
      return false;
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
      return false;
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
      return false;
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
      return false;
    }

    // Execute trailing logic and get result
    const wasUpdated = TRAILING_STOP_LOSS_FN(this, this._pendingSignal, percentShift);

    // If trailing was not updated (absorption rejected), return false without persistence
    if (!wasUpdated) {
      return false;
    }

    // Persist updated signal state (inline setPendingSignal content)
    // Note: this._pendingSignal already mutated by TRAILING_STOP_FN, no reassignment needed
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      const publicSignal = TO_PUBLIC_SIGNAL(this._pendingSignal, currentPrice);
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

    // Queue commit event for processing in tick()/backtest() with proper timestamp
    this._commitQueue.push({
      action: "trailing-stop",
      symbol,
      backtest,
      percentShift,
      currentPrice,
    });

    return true;
  }

  /**
   * Validates preconditions for trailingTake without mutating state.
   *
   * Returns false (never throws) when any condition would cause trailingTake to fail or skip.
   * Includes absorption check: returns false if new TP would not improve on the current trailing TP.
   *
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to ORIGINAL TP distance (-100 to 100)
   * @param currentPrice - Current market price to check for intrusion
   * @returns boolean - true if trailingTake would execute, false otherwise
   */
  public async validateTrailingTake(
    symbol: string,
    percentShift: number,
    currentPrice: number
  ): Promise<boolean> {
    this.params.logger.debug("ClientStrategy validateTrailingTake", {
      symbol,
      percentShift,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });
    if (!this._pendingSignal) return false;
    if (typeof percentShift !== "number" || !isFinite(percentShift)) return false;
    if (percentShift < -100 || percentShift > 100) return false;
    if (percentShift === 0) return false;
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) return false;

    const signal = this._pendingSignal;
    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
    const tpDistancePercent = Math.abs((signal.priceTakeProfit - effectivePriceOpen) / effectivePriceOpen * 100);
    const newTpDistancePercent = tpDistancePercent + percentShift;

    let newTakeProfit: number;
    if (signal.position === "long") {
      newTakeProfit = effectivePriceOpen * (1 + newTpDistancePercent / 100);
    } else {
      newTakeProfit = effectivePriceOpen * (1 - newTpDistancePercent / 100);
    }

    // Intrusion check (mirrors trailingTake method: applied before TRAILING_TAKE_PROFIT_FN, for all calls)
    if (signal.position === "long" && currentPrice > newTakeProfit) return false;
    if (signal.position === "short" && currentPrice < newTakeProfit) return false;

    const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;
    if (signal.position === "long" && newTakeProfit <= effectiveStopLoss) return false;
    if (signal.position === "short" && newTakeProfit >= effectiveStopLoss) return false;

    // Absorption check (mirrors TRAILING_TAKE_PROFIT_FN: first call is unconditional)
    const currentTrailingTP = signal._trailingPriceTakeProfit;
    if (currentTrailingTP !== undefined) {
      if (signal.position === "long" && newTakeProfit >= currentTrailingTP) return false;
      if (signal.position === "short" && newTakeProfit <= currentTrailingTP) return false;
    }

    return true;
  }

  
  /**
   * Adjusts the trailing take-profit distance for an active pending signal.
   *
   * CRITICAL: Always calculates from ORIGINAL TP, not from current trailing TP.
   * This prevents error accumulation on repeated calls.
   * Larger percentShift ABSORBS smaller one (updates only towards more conservative TP).
   *
   * Updates the take-profit distance by a percentage adjustment relative to the ORIGINAL TP distance.
   * Negative percentShift brings TP closer to entry (more conservative).
   * Positive percentShift moves TP further from entry (more aggressive).
   *
   * Trailing behavior (absorption):
   * - First call: sets trailing TP unconditionally
   * - Subsequent calls: updates only if new TP is MORE CONSERVATIVE (closer to entry)
   * - For LONG: only accepts LOWER TP (never moves up, closer to entry wins)
   * - For SHORT: only accepts HIGHER TP (never moves down, closer to entry wins)
   * - Stores in _trailingPriceTakeProfit, original priceTakeProfit always preserved
   *
   * Example of absorption (LONG, entry=100, originalTP=110):
   * ```typescript
   * await trailingTake(-30, price); // Sets TP=107 (first call, 7% distance)
   * await trailingTake(+20, price); // SKIPPED: TP=112 > 107 (less conservative)
   * await trailingTake(-50, price); // Sets TP=105 (more conservative, absorbs previous)
   * ```
   *
   * Price intrusion protection: If current price has already crossed the new TP level,
   * the update is skipped to prevent immediate TP triggering.
   *
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to ORIGINAL TP distance (-100 to 100)
   * @param currentPrice - Current market price to check for intrusion
   * @param backtest - Whether running in backtest mode
   * @returns Promise<boolean> - true if trailing TP was set/updated, false if rejected (absorption/intrusion/conflict)
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalTP=110, distance=10%, currentPrice=102
   *
   * // Move TP closer by 30% (more conservative)
   * const success1 = await strategy.trailingTake("BTCUSDT", -30, 102, false);
   * // success1 = true, newDistance = 10% - 30% = 7%, newTP = 100 * (1 + 0.07) = 107
   *
   * // Try to move TP further by 20% (less conservative)
   * const success2 = await strategy.trailingTake("BTCUSDT", 20, 102, false);
   * // success2 = false (SKIPPED: newTP=112 > 107, less conservative, larger % absorbs smaller)
   *
   * // Move TP even closer by 50% (most conservative)
   * const success3 = await strategy.trailingTake("BTCUSDT", -50, 102, false);
   * // success3 = true, newDistance = 10% - 50% = 5%, newTP = 100 * (1 + 0.05) = 105
   * // Updated! TP=105 < 107 (more conservative)
   *
   * // SHORT: entry=100, originalTP=90, distance=10%, currentPrice=98
   * // Move TP closer by 30%: newTP = 100 - 7% = 93
   * const success4 = await strategy.trailingTake("BTCUSDT", -30, 98, false);
   * // success4 = true
   * ```
   */
  public async trailingTake(
    symbol: string,
    percentShift: number,
    currentPrice: number,
    backtest: boolean
  ): Promise<boolean> {
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
    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
    const tpDistancePercent = Math.abs((signal.priceTakeProfit - effectivePriceOpen) / effectivePriceOpen * 100);
    const newTpDistancePercent = tpDistancePercent + percentShift;

    let newTakeProfit: number;
    if (signal.position === "long") {
      newTakeProfit = effectivePriceOpen * (1 + newTpDistancePercent / 100);
    } else {
      newTakeProfit = effectivePriceOpen * (1 - newTpDistancePercent / 100);
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
      return false;
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
      return false;
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
      return false;
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
      return false;
    }

    // Execute trailing logic and get result
    const wasUpdated = TRAILING_TAKE_PROFIT_FN(this, this._pendingSignal, percentShift);

    // If trailing was not updated (absorption rejected), return false without persistence
    if (!wasUpdated) {
      return false;
    }

    // Persist updated signal state (inline setPendingSignal content)
    // Note: this._pendingSignal already mutated by TRAILING_PROFIT_FN, no reassignment needed
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      const publicSignal = TO_PUBLIC_SIGNAL(this._pendingSignal, currentPrice);
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

    // Queue commit event for processing in tick()/backtest() with proper timestamp
    this._commitQueue.push({
      action: "trailing-take",
      symbol,
      backtest,
      percentShift,
      currentPrice,
    });

    return true;
  }

  /**
   * Validates preconditions for averageBuy without mutating state.
   *
   * Returns false (never throws) when any condition would cause averageBuy to fail or skip.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - New entry price to add
   * @returns boolean - true if averageBuy would execute, false otherwise
   */
  public async validateAverageBuy(
    symbol: string,
    currentPrice: number
  ): Promise<boolean> {
    this.params.logger.debug("ClientStrategy validateAverageBuy", {
      symbol,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });

    if (!this._pendingSignal) return false;
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) return false;

    const signal = this._pendingSignal;
    const entries = (!signal._entry || signal._entry.length === 0)
      ? [{ price: signal.priceOpen, cost: GLOBAL_CONFIG.CC_POSITION_ENTRY_COST }]
      : signal._entry;

    if (signal.position === "long") {
      const minEntryPrice = Math.min(...entries.map((e) => e.price));
      if (!GLOBAL_CONFIG.CC_ENABLE_DCA_EVERYWHERE && currentPrice >= minEntryPrice) return false;
    } else {
      const maxEntryPrice = Math.max(...entries.map((e) => e.price));
      if (!GLOBAL_CONFIG.CC_ENABLE_DCA_EVERYWHERE && currentPrice <= maxEntryPrice) return false;
    }

    return true;
  }

  /**
   * Adds a new averaging entry to an open position (DCA — Dollar Cost Averaging).
   *
   * Appends currentPrice to the _entry array. The effective entry price used in all
   * distance and PNL calculations becomes the simple arithmetic mean of all _entry prices.
   * Original priceOpen is preserved unchanged for identity/audit purposes.
   *
   * Rejection rules (returns false without throwing):
   * - LONG: currentPrice >= last entry price (must average down, not up or equal)
   * - SHORT: currentPrice <= last entry price (must average down, not up or equal)
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - New entry price to add to the averaging history
   * @param backtest - Whether running in backtest mode
   * @returns Promise<boolean> - true if entry added, false if rejected by direction check
   */
  public async averageBuy(
    symbol: string,
    currentPrice: number,
    backtest: boolean,
    cost: number = GLOBAL_CONFIG.CC_POSITION_ENTRY_COST
  ): Promise<boolean> {
    this.params.logger.debug("ClientStrategy averageBuy", {
      symbol,
      currentPrice,
      hasPendingSignal: this._pendingSignal !== null,
    });

    // Validation: must have pending signal
    if (!this._pendingSignal) {
      throw new Error(
        `ClientStrategy averageBuy: No pending signal exists for symbol=${symbol}`
      );
    }

    // Validation: currentPrice must be valid
    if (typeof currentPrice !== "number" || !isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(
        `ClientStrategy averageBuy: currentPrice must be a positive finite number, got ${currentPrice}`
      );
    }

    // Execute averaging logic
    const result = AVERAGE_BUY_FN(this, this._pendingSignal, currentPrice, cost);

    if (!result) {
      return false;
    }

    // Persist updated signal state
    this.params.logger.debug("ClientStrategy setPendingSignal (inline)", {
      pendingSignal: this._pendingSignal,
    });

    // Call onWrite callback for testing persist storage
    if (this.params.callbacks?.onWrite) {
      this.params.callbacks.onWrite(
        this.params.execution.context.symbol,
        TO_PUBLIC_SIGNAL(this._pendingSignal, currentPrice),
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

    // Queue commit event for processing in tick()/backtest() with proper timestamp
    this._commitQueue.push({
      action: "average-buy",
      symbol,
      backtest,
      currentPrice,
      cost,
      totalEntries: this._pendingSignal._entry?.length ?? 1,
    });

    return true;
  }

  /**
   * Disposes the strategy instance and cleans up resources.
   *
   * Calls the onDispose callback to notify external systems that this strategy
   * instance is being removed from cache.
   *
   * Uses singleshot pattern to ensure disposal happens exactly once.
   *
   * @returns Promise that resolves when disposal is complete
   */
  public dispose = singleshot(async () => await WAIT_FOR_DISPOSE_FN(this));
}

export default ClientStrategy;
