import {
  errorData,
  getErrorMessage,
  not,
  randomString,
  singleshot,
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
  StrategyCloseReason,
  ICommitRow,
  CommitPayload,
  IStrategyPnL,
  StrategyStatus,
} from "../interfaces/Strategy.interface";
import toProfitLossDto from "../helpers/toProfitLossDto";
import { getEffectivePriceOpen as GET_EFFECTIVE_PRICE_OPEN } from "../helpers/getEffectivePriceOpen";
import { ICandleData } from "../interfaces/Exchange.interface";
import { PersistSignalAdapter, PersistScheduleAdapter, PersistRecentAdapter, PersistStrategyAdapter } from "../classes/Persist";
import { ExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { errorEmitter, exitEmitter, backtestScheduleOpenSubject } from "../config/emitters";
import { GLOBAL_CONFIG } from "../config/params";
import { getTotalClosed } from "../helpers/getTotalClosed";
import beginTime from "../utils/beginTime";
import { StrategyCommitContract } from "../contract/StrategyCommit.contract";
import { OrderCheckContract } from "../contract/OrderCheck.contract";
import validatePendingSignal from "../validation/validatePendingSignal";
import validateScheduledSignal from "../validation/validateScheduledSignal";
import validateSignal from "../validation/validateSignal";
import OrderRejectedError from "../error/OrderRejectedError";
import OrderDeletedError from "../error/OrderDeletedError";
import { BROKER_ORDER_VERDICT, type IBrokerOrderVerdict } from "../interfaces/Broker.interface";

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
  timestamp: number;
}>;

/**
 * Type for DCA average contract used in getPositionEntries
 * Contains details of the average buy execution to calculate effective priceOpen and PnL.
 * Used to track multiple entries in a position and their impact on overall profitability.
 */
type Entries = Array<{ price: number; cost: number; timestamp: number }>;

/**
 * Mock value for scheduled signal pendingAt timestamp.
 * Used to indicate that the actual pendingAt will be set upon activation.
 */
const SCHEDULED_SIGNAL_PENDING_MOCK = 0;

const TIMEOUT_SYMBOL = Symbol('timeout');

/**
 * Relative tolerance for the partial-close 100% cap.
 *
 * «Закрыть ровно остаток позиции» проходит через цепочки конверсий
 * percent↔dollar (percent/100 × costBasisAtClose × реплей партиалов), где
 * накапливается floating-point дрейф в несколько ULP. Строгое сравнение
 * `newTotalClosedDollar > totalInvested` из-за этого может отклонить легитимное
 * закрытие оставшихся 100%. Сравнение с totalInvested × этот множитель
 * поглощает дрейф, но по-прежнему режет любой реальный перебор (1e-9
 * относительных — на порядки больше ULP-шума double и на порядки меньше
 * минимально осмысленной доли позиции).
 */
const PARTIAL_CAP_TOLERANCE_FACTOR = 1 + 1e-9;

/**
 * Относительный порог «позиция полностью закрыта партиалами»: остаток базиса
 * меньше totalInvested × 1e-9 неотличим от нуля (тот же порядок допуска, что и
 * PARTIAL_CAP_TOLERANCE_FACTOR). Достигнув его, partialProfit/partialLoss
 * маршрутизируют позицию в штатный deferred-close: мониторить нечего, а
 * TP/SL-«закрытие» нулевого остатка засоряло бы статистику полноценной сделкой.
 */
const PARTIAL_FULL_CLOSE_EPSILON = 1e-9;

/** Shared immutable verdict instances (see IBrokerOrderVerdict in interfaces/Broker.interface) */
const VERDICT_CONFIRMED: IBrokerOrderVerdict = Object.freeze({ __type__: BROKER_ORDER_VERDICT, reason: "confirmed" as const });
const VERDICT_TRANSIENT: IBrokerOrderVerdict = Object.freeze({ __type__: BROKER_ORDER_VERDICT, reason: "transient" as const });

/**
 * Normalizes a raw onOrderSync/onOrderCheck result into an IBrokerOrderVerdict.
 *
 * A verdict is recognized STRICTLY by the runtime brand __type__ ===
 * BROKER_ORDER_VERDICT (Symbol.for — survives duplicated module instances), never by
 * shape: a userspace object that merely happens to carry a `reason` key must not be
 * honored as a framework verdict. Everything unbranded falls back to the legacy
 * boolean contract — true/void collapse to "confirmed", false to "transient"
 * (production callbacks CREATE_SYNC_FN / CREATE_SYNC_PENDING_FN always return
 * branded verdicts; booleans come from legacy/mocked callbacks in tests).
 */
const TO_ORDER_VERDICT_FN = (raw: unknown): IBrokerOrderVerdict => {
  if (raw && typeof raw === "object" && Reflect.get(raw, "__type__") === BROKER_ORDER_VERDICT) {
    return raw as IBrokerOrderVerdict;
  }
  return raw === false ? VERDICT_TRANSIENT : VERDICT_CONFIRMED;
};

/**
 * Invokes params.onOrderSync with typed-error translation and verdict normalization.
 *
 * A thrown OrderRejectedError is the TERMINAL business rejection ("no counterparty,
 * retrying is pointless") — resolved to the "rejected" verdict so the callers skip
 * the bounded retry loop (drop the open / force-close immediately). The production
 * onOrderSync (StrategyConnectionService CREATE_SYNC_FN) performs the same translation
 * on its own layer; this guard covers directly-mocked params.onOrderSync (tests) and
 * keeps the verdict contract independent of the wiring. Any other throw propagates to
 * the outer trycatch of the calling wrapper (→ "transient" via its defaultValue).
 */
const CALL_ORDER_SYNC_GUARDED_FN = async (
  self: ClientStrategy,
  event: Parameters<ClientStrategy["params"]["onOrderSync"]>[0]
): Promise<IBrokerOrderVerdict> => {
  try {
    return TO_ORDER_VERDICT_FN(await self.params.onOrderSync(event));
  } catch (error) {
    if (OrderRejectedError.isOrderRejectedError(error as object)) {
      const message = "ClientStrategy CALL_ORDER_SYNC_GUARDED_FN: OrderRejectedError — terminal business rejection";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
        signalId: event.signalId,
        action: event.action,
        type: event.type,
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error as Error);
      return { __type__: BROKER_ORDER_VERDICT, reason: "rejected", error };
    }
    throw error;
  }
};

/**
 * Invokes params.onOrderCheck with typed-error translation and verdict normalization.
 *
 * A thrown OrderDeletedError is the adapter's CONFIRMED "order not found by id"
 * (e.g. the user deleted the order manually) — resolved to the "deleted" verdict
 * so the caller acts terminally at once, bypassing the CC_ORDER_CHECK_RETRY_ATTEMPTS
 * tolerance counter. Any other throw propagates to the outer trycatch of the calling
 * wrapper (→ "transient" via its defaultValue).
 */
const CALL_ORDER_CHECK_GUARDED_FN = async (
  self: ClientStrategy,
  event: Parameters<ClientStrategy["params"]["onOrderCheck"]>[0]
): Promise<IBrokerOrderVerdict> => {
  try {
    return TO_ORDER_VERDICT_FN(await self.params.onOrderCheck(event));
  } catch (error) {
    if (OrderDeletedError.isOrderDeletedError(error as object)) {
      const message = "ClientStrategy CALL_ORDER_CHECK_GUARDED_FN: OrderDeletedError — confirmed order-not-found";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
        signalId: event.signalId,
        type: event.type,
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error as Error);
      return { __type__: BROKER_ORDER_VERDICT, reason: "deleted", error };
    }
    throw error;
  }
};

/**
 * Calls onOrderSync callback for signal-open event.
 *
 * Invoked BEFORE setPendingSignal to give the external system a chance to confirm
 * that the limit order was filled on the exchange. If the callback returns false
 * (or throws), the position open is skipped and the strategy state is NOT mutated.
 * The framework will retry on the next tick: the rejecting branch rolls back the
 * interval throttle (_lastSignalTimestamp) consumed in GET_SIGNAL_FN, so getSignal
 * runs again immediately instead of waiting for the next interval boundary.
 * A thrown OrderRejectedError is terminal: the open is dropped without arming the
 * identity-stable retry (see CALL_ORDER_SYNC_GUARDED_FN).
 */
const CALL_ORDER_SYNC_OPEN_FN = trycatch(
  async (
    timestamp: number,
    currentPrice: number,
    pendingSignal: ISignalRow,
    self: ClientStrategy
  ): Promise<IBrokerOrderVerdict> => {
    const publicSignal = TO_PUBLIC_SIGNAL("pending", pendingSignal, currentPrice);
    return await CALL_ORDER_SYNC_GUARDED_FN(self, {
      action: "signal-open",
      type: "active",
      // Prior STARTED attempts for THIS id (counter is pre-armed before this call,
      // so count-1 = attempts that may have reached the exchange; >= 1 means the
      // adapter MUST reconcile by clientOrderId before re-sending). Activation
      // paths (id not in the retry slot) always report 0.
      attempt: self._retryOpenSignal?.id === pendingSignal.id
        ? Math.max(self._retryOpenCount - 1, 0)
        : 0,
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      backtest: self.params.execution.context.backtest,
      signalId: pendingSignal.id,
      timestamp,
      signal: publicSignal,
      maxDrawdown: publicSignal.maxDrawdown,
      peakProfit: publicSignal.peakProfit,
      cost: pendingSignal.cost,
      currentPrice,
      position: publicSignal.position,
      pnl: publicSignal.pnl,
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
    defaultValue: VERDICT_TRANSIENT,
    fallback: (error, timestamp, currentPrice, pendingSignal, self) => {
      const message = "ClientStrategy CALL_ORDER_SYNC_OPEN_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
        data: {
          timestamp,
          currentPrice,
          signalId: pendingSignal.id,
        }
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    }
  }
);

/**
 * Calls onOrderSync callback for the scheduled-order placement event
 * (action "signal-open", type "schedule").
 *
 * Invoked BEFORE setScheduledSignal to give the external system a chance to confirm
 * that the resting entry (limit) order was actually PLACED on the exchange. If the
 * callback returns false (or throws), the scheduled signal is NOT registered, the
 * risk reservation is released and the interval throttle is rolled back — the
 * placement retries on the next tick (mirrors the type "active" open gate).
 */
const CALL_ORDER_SYNC_SCHEDULE_OPEN_FN = trycatch(
  async (
    timestamp: number,
    currentPrice: number,
    scheduledSignal: IScheduledSignalRow,
    self: ClientStrategy
  ): Promise<IBrokerOrderVerdict> => {
    const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduledSignal, currentPrice);
    return await CALL_ORDER_SYNC_GUARDED_FN(self, {
      action: "signal-open",
      type: "schedule",
      // Prior STARTED placement attempts for THIS id (counter pre-armed before this
      // call; >= 1 means a prior placement may have reached the exchange)
      attempt: self._retryOpenSignal?.id === scheduledSignal.id
        ? Math.max(self._retryOpenCount - 1, 0)
        : 0,
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      backtest: self.params.execution.context.backtest,
      signalId: scheduledSignal.id,
      timestamp,
      signal: publicSignal,
      maxDrawdown: publicSignal.maxDrawdown,
      peakProfit: publicSignal.peakProfit,
      cost: scheduledSignal.cost,
      currentPrice,
      position: publicSignal.position,
      pnl: publicSignal.pnl,
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
    defaultValue: VERDICT_TRANSIENT,
    fallback: (error, timestamp, currentPrice, scheduledSignal, self) => {
      const message = "ClientStrategy CALL_ORDER_SYNC_SCHEDULE_OPEN_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
        data: {
          timestamp,
          currentPrice,
          signalId: scheduledSignal.id,
        }
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    }
  }
);

/**
 * Calls onOrderSync callback for signal-close event.
 *
 * Invoked BEFORE setPendingSignal(null) to give the external system a chance to confirm
 * that the position was closed on the exchange (e.g. market order filled, OCO cancelled).
 * If the callback returns false (or throws), the position close is skipped and the
 * strategy state is NOT mutated. The framework will retry on the next tick.
 */
const CALL_ORDER_SYNC_CLOSE_FN = trycatch(
  async (
    timestamp: number,
    currentPrice: number,
    closeReason: "time_expired" | "take_profit" | "stop_loss" | "closed",
    signal: ISignalRow,
    self: ClientStrategy
  ): Promise<IBrokerOrderVerdict> => {
    // PRE-ARM: count the STARTED close attempt and persist BEFORE the gate call —
    // a crash after the exit order was POSTed but before the verdict restores
    // attempt >= 1, telling the adapter to verify the position before re-sending.
    self._retryCloseCount += 1;
    await PERSIST_STRATEGY_FN(self);
    const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
    return await CALL_ORDER_SYNC_GUARDED_FN(self, {
      action: "signal-close",
      type: "active",
      // Prior STARTED close attempts (counter pre-armed above; >= 1 means a prior
      // exit order may have reached the exchange)
      attempt: self._retryCloseCount - 1,
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      backtest: self.params.execution.context.backtest,
      signalId: signal.id,
      timestamp,
      signal: publicSignal,
      maxDrawdown: publicSignal.maxDrawdown,
      peakProfit: publicSignal.peakProfit,
      currentPrice,
      pnl: publicSignal.pnl,
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
    defaultValue: VERDICT_TRANSIENT,
    fallback: (error, timestamp, currentPrice, closeReason, signal, self) => {
      const message = "ClientStrategy CALL_ORDER_SYNC_CLOSE_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
        data: {
          timestamp,
          currentPrice,
          closeReason,
          signalId: signal.id,
        }
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    }
  }
);

/**
 * Calls onOrderCheck callback for the pending-order synchronization event (type "active").
 *
 * Invoked at the start of the pending-signal monitoring block on every LIVE tick, BEFORE the
 * framework evaluates TP/SL/time completion. It asks the external order management system
 * whether the order backing this position is STILL pending (open) on the exchange.
 *
 * The Subject `await .next()` propagates listener exceptions passthrough, so the trycatch wrapper
 * collapses both a thrown listener and an explicit `false` into `false` (defaultValue). A `false`
 * result means the order is no longer open on the exchange and the caller closes the position with
 * closeReason "closed". A missing/true result keeps the position under normal TP/SL monitoring.
 */
const CALL_ORDER_CHECK_FN = trycatch(
  async (
    timestamp: number,
    currentPrice: number,
    signal: ISignalRow,
    self: ClientStrategy
  ): Promise<IBrokerOrderVerdict> => {
    const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
    return await CALL_ORDER_CHECK_GUARDED_FN(self, {
      action: "signal-ping",
      type: "active",
      // Consecutive prior failed checks tolerated as transient so far
      attempt: self._orderCheckAttempt,
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      backtest: self.params.execution.context.backtest,
      signalId: signal.id,
      timestamp,
      signal: publicSignal,
      currentPrice,
      pnl: publicSignal.pnl,
      peakProfit: publicSignal.peakProfit,
      maxDrawdown: publicSignal.maxDrawdown,
      position: publicSignal.position,
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
    defaultValue: VERDICT_TRANSIENT,
    fallback: (error, timestamp, currentPrice, signal, self) => {
      const message = "ClientStrategy CALL_ORDER_CHECK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
        data: {
          timestamp,
          currentPrice,
          signalId: signal.id,
        }
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    }
  }
);

/**
 * Calls onOrderCheck callback for the scheduled-order synchronization event (type "schedule").
 *
 * Invoked at the start of the scheduled-signal monitoring block on every LIVE tick, BEFORE the
 * framework evaluates timeout/price activation. It asks the external order management system
 * whether the resting entry order backing this scheduled signal is STILL open on the exchange.
 *
 * Same gate semantics as the pending-order ping (type "active"): the trycatch wrapper collapses
 * a thrown listener and an explicit `false` into `false` (defaultValue). A `false` result means
 * the resting order is no longer open on the exchange — the caller cancels the scheduled signal
 * (reason "user"). If the order actually FILLED, the adapter must confirm the fill via
 * activateScheduled instead of failing this ping: a failed ping is a terminal cancel.
 */
const CALL_SCHEDULED_ORDER_CHECK_FN = trycatch(
  async (
    timestamp: number,
    currentPrice: number,
    scheduled: IScheduledSignalRow,
    self: ClientStrategy
  ): Promise<IBrokerOrderVerdict> => {
    const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, currentPrice);
    return await CALL_ORDER_CHECK_GUARDED_FN(self, {
      action: "signal-ping",
      type: "schedule",
      // Consecutive prior failed checks tolerated as transient so far
      attempt: self._orderCheckAttempt,
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      backtest: self.params.execution.context.backtest,
      signalId: scheduled.id,
      timestamp,
      signal: publicSignal,
      currentPrice,
      pnl: publicSignal.pnl,
      peakProfit: publicSignal.peakProfit,
      maxDrawdown: publicSignal.maxDrawdown,
      position: publicSignal.position,
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
    defaultValue: VERDICT_TRANSIENT,
    fallback: (error, timestamp, currentPrice, scheduled, self) => {
      const message = "ClientStrategy CALL_SCHEDULED_ORDER_CHECK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
        data: {
          timestamp,
          currentPrice,
          signalId: scheduled.id,
        }
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    }
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_COMMIT_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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

  // Persist the now-empty queue so a crash after draining does not replay commits
  // that were already forwarded to the broker on the next restart.
  await PERSIST_STRATEGY_FN(self);

  // Attribution: prefer the live pending signal; fall back to a deferred USER
  // close snapshot (closePending / full-partial auto-close cleared the pending,
  // but the queued partial/trailing commits belong to exactly that position and
  // its snapshot carries the final state). Broker-confirmed TP/SL fills
  // (_takeProfitSignal/_stopLossSignal) intentionally do NOT attribute: the
  // whole order closed on the exchange, so queued partials are void (see the
  // orphaned-queue recovery test).
  const attributionSignal = self._pendingSignal ?? self._closedSignal;

  if (!attributionSignal) {
    // Delivery is at-most-once: the queue was already persisted as empty above.
    // Never drop broker-confirmed operations silently — make the loss visible.
    const message = "ClientStrategy PROCESS_COMMIT_QUEUE_FN: dropping queued commits — no pending signal to attribute them to";
    const payload = {
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      droppedActions: queue.map(({ action }) => action),
      droppedCount: queue.length,
    };
    self.params.logger.warn(message, payload);
    console.warn(message, payload);
    return;
  }

  for (const commit of queue) {
    if (commit.action === "partial-profit") {
      const publicSignal = TO_PUBLIC_SIGNAL("pending", attributionSignal, commit.currentPrice);
      await CALL_COMMIT_FN(self, {
        action: "partial-profit",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        percentToClose: commit.percentToClose,
        currentPrice: commit.currentPrice,
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
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
        note: publicSignal.note,
      });
      continue
    }
    if (commit.action === "partial-loss") {
      const publicSignal = TO_PUBLIC_SIGNAL("pending", attributionSignal, commit.currentPrice);
      await CALL_COMMIT_FN(self, {
        action: "partial-loss",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        percentToClose: commit.percentToClose,
        currentPrice: commit.currentPrice,
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
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
        note: publicSignal.note,
      });
      continue
    }
    if (commit.action === "breakeven") {
      const publicSignal = TO_PUBLIC_SIGNAL("pending", attributionSignal, commit.currentPrice);
      await CALL_COMMIT_FN(self, {
        action: "breakeven",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        currentPrice: commit.currentPrice,
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
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
        note: publicSignal.note,
      });
      continue
    }
    if (commit.action === "trailing-stop") {
      const publicSignal = TO_PUBLIC_SIGNAL("pending", attributionSignal, commit.currentPrice);
      await CALL_COMMIT_FN(self, {
        action: "trailing-stop",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        percentShift: commit.percentShift,
        currentPrice: commit.currentPrice,
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
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
        note: publicSignal.note,
      });
      continue;
    }
    if (commit.action === "trailing-take") {
      const publicSignal = TO_PUBLIC_SIGNAL("pending", attributionSignal, commit.currentPrice);
      await CALL_COMMIT_FN(self, {
        action: "trailing-take",
        symbol: commit.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        backtest: commit.backtest,
        percentShift: commit.percentShift,
        currentPrice: commit.currentPrice,
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
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
        note: publicSignal.note,
      });
      continue;
    }
    if (commit.action === "average-buy") {
      const publicSignal = TO_PUBLIC_SIGNAL("pending", attributionSignal, commit.currentPrice);
      const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(attributionSignal);
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
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
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
        note: publicSignal.note,
      });
      continue;
    }
  }
};

/** Zero PNL constant for scheduled signals (which don't have priceOpen or PNL yet) */
const ZERO_PNL: IStrategyPnL = { pnlPercentage: 0, priceOpen: 0, priceClose: 0, pnlCost: 0, pnlEntries: 0 };

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
const TO_PUBLIC_SIGNAL = <T extends ISignalDto | ISignalRow | IScheduledSignalRow>(type: "pending" | "scheduled", signal: T, currentPrice: number): IPublicSignalRow => {
  const hasTrailingSL = "_trailingPriceStopLoss" in signal && signal._trailingPriceStopLoss !== undefined;
  const hasTrailingTP = "_trailingPriceTakeProfit" in signal && signal._trailingPriceTakeProfit !== undefined;
  const partialExecuted = "_partial" in signal
    ? getTotalClosed(signal).totalClosedPercent
    : 0;
  const totalEntries = ("_entry" in signal && Array.isArray(signal._entry))
    ? signal._entry.length
    : type === "scheduled" ? 0 : 1;
  const totalPartials = ("_partial" in signal && Array.isArray(signal._partial))
    ? signal._partial.length
    : 0;
  const pnl = type === "scheduled" ? ZERO_PNL : toProfitLossDto(signal as ISignalRow, currentPrice);
  const maxDrawdown = type === "scheduled" ? ZERO_PNL : ("_fall" in signal ? !!signal["_fall"] ? ({ ...signal._fall }) : ZERO_PNL : ZERO_PNL);
  const peakProfit = type === "scheduled" ? ZERO_PNL : ("_peak" in signal ? signal["_peak"] ? ({ ...signal._peak }) : ZERO_PNL : ZERO_PNL);
  const effectivePriceOpen = type === "scheduled" ? signal.priceOpen : "_entry" in signal ? signal["_entry"] ? GET_EFFECTIVE_PRICE_OPEN(signal) : signal.priceOpen : signal.priceOpen;
  return {
    ...structuredClone(signal) as ISignalRow | IScheduledSignalRow,
    priceOpen: effectivePriceOpen,
    priceStopLoss: hasTrailingSL ? signal._trailingPriceStopLoss : signal.priceStopLoss,
    priceTakeProfit: hasTrailingTP ? signal._trailingPriceTakeProfit : signal.priceTakeProfit,
    originalPriceOpen: signal.priceOpen,
    originalPriceStopLoss: signal.priceStopLoss,
    originalPriceTakeProfit: signal.priceTakeProfit,
    maxDrawdown,
    peakProfit,
    partialExecuted,
    totalEntries,
    totalPartials,
    pnl,
  };
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

      // Проверяем что наступил новый интервал (по aligned timestamp).
      // User-queued DTO (createSignal) минует троттл: это явная команда, а не
      // периодическая генерация — ожидание границы интервала задерживало её
      // до целого интервала (час для "1h"). Потребление DTO при этом занимает
      // слот текущего интервала (ниже), так что собственная генерация
      // стратегии не учащается.
      // Вооружённый open-ретрай (_retryOpenSignal) минует троттл по той же
      // причине: reject-ветки откатывают троттл сами, но восстановленный после
      // рестарта слот не должен ждать границы интервала.
      if (
        !self._userSignal &&
        !self._retryOpenSignal &&
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
    // PRIORITY: a user-queued createPending/createScheduled DTO (set out of async-hooks
    // context) takes precedence over params.getSignal. When present it is consumed once
    // here — the slot is cleared and the snapshot rewritten — and then flows through the
    // exact same pipeline (risk check, priceOpen branching, onOrderSync on open) as a
    // signal returned by getSignal would.
    let signal: ISignalDto | null | symbol;

    // PRIORITY 0: взведённый open-ретрай (CC_ORDER_OPEN_RETRY_ATTEMPTS). Row
    // повторяется с ОРИГИНАЛЬНЫМ id, чтобы адаптер размещал ордер идемпотентно:
    // clientOrderId = signalId, а при attempt > 0 адаптер обязан сверить прошлую
    // попытку по этому id ДО отправки (Binance-нюанс: duplicate-guard действует
    // только среди ОТКРЫТЫХ ордеров — мгновенно исполненный дубликатом не станет).
    // Слот взводится ДО каждого гейт-вызова (ARM_RETRY_OPEN_SIGNAL_FN, write-ahead
    // самой попытки): его снимает успешный open, исчерпание бюджета стартов ниже
    // или провал consumption-ревалидации — до дюрабельного исхода крэш реиграет
    // тот же id, включая крэш ПОСРЕДИ первой попытки.
    let retrySignal = GLOBAL_CONFIG.CC_ORDER_OPEN_RETRY_ATTEMPTS > 0
      ? self._retryOpenSignal
      : null;
    // Исчерпание бюджета: count стартов уже покрыл 1 исходную + CC ретраев —
    // следующий старт был бы лишним. Громкий дроп (сеть не дала открыться —
    // фатальный сигнал ПОСЛЕ errorEmitter-лога) и fall-through к обычной
    // генерации ТЕМ ЖЕ тиком (свежий сигнал с новым id).
    if (retrySignal && self._retryOpenCount > GLOBAL_CONFIG.CC_ORDER_OPEN_RETRY_ATTEMPTS) {
      const message = "ClientStrategy GET_SIGNAL_FN: open retry attempts exhausted, dropping signal";
      const payload = {
        symbol: self.params.execution.context.symbol,
        strategyName: self.params.strategyName,
        signalId: retrySignal.id,
        note: retrySignal.note,
        attempts: self._retryOpenCount,
        maxAttempts: GLOBAL_CONFIG.CC_ORDER_OPEN_RETRY_ATTEMPTS,
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      const error = new Error(message);
      errorEmitter.next(error);
      exitEmitter.next(error);
      self._retryOpenSignal = null;
      self._retryOpenCount = 0;
      await PERSIST_STRATEGY_FN(self);
      retrySignal = null;
    }
    if (retrySignal) {
      if (!validateSignal(retrySignal, currentPrice)) {
        const message = "ClientStrategy GET_SIGNAL_FN: open-retry signal failed consumption re-validation (price moved since the rejected attempt), dropped";
        const payload = {
          symbol: self.params.execution.context.symbol,
          strategyName: self.params.strategyName,
          signalId: retrySignal.id,
          note: retrySignal.note,
          attempts: self._retryOpenCount,
          currentPrice,
        };
        self.params.logger.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(new Error(message));
        self._retryOpenSignal = null;
        self._retryOpenCount = 0;
        await PERSIST_STRATEGY_FN(self);
        self._lastSignalTimestamp = null;
        return null;
      }
      signal = retrySignal;
    } else {
      if (!self._userSignal) {
        const timeoutMs = GLOBAL_CONFIG.CC_MAX_SIGNAL_GENERATION_SECONDS * 1_000;
        // Cancelable timeout instead of a plain sleep: Promise.race does not
        // cancel the loser, so the sleep timer stayed referenced for the full
        // CC_MAX_SIGNAL_GENERATION_SECONDS after every getSignal call — keeping
        // the node process alive up to 3 minutes after a backtest finishes and
        // piling up one live timer per interval on long runs.
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          signal = await Promise.race([
            self.params.getSignal(
              self.params.execution.context.symbol,
              self.params.execution.context.when,
              currentPrice,
            ),
            new Promise<typeof TIMEOUT_SYMBOL>((res) => {
              timeoutId = setTimeout(() => res(TIMEOUT_SYMBOL), timeoutMs);
            }),
          ]);
        } finally {
          timeoutId !== undefined && clearTimeout(timeoutId);
        }
      }
      if (self._userSignal) {
        const userDto = self._userSignal;
        self._userSignal = null;
        await PERSIST_STRATEGY_FN(self);
        // Consumption re-validation against the CURRENT price: the DTO was
        // validated in createSignal against a price that may have moved since.
        // A now-invalid DTO dies here (at-most-once) — make that death loud and
        // distinct (dedicated warn + errorEmitter) instead of the generic
        // GET_SIGNAL_FN fallback, and roll back the interval throttle so the
        // strategy's own generation resumes on the next tick (consistent with
        // the risk/sync rejection paths).
        if (!validateSignal(
          {
            ...userDto,
            priceOpen: userDto.priceOpen ?? currentPrice,
            minuteEstimatedTime: userDto.minuteEstimatedTime ?? GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES,
          },
          currentPrice,
        )) {
          const message = "ClientStrategy GET_SIGNAL_FN: queued createSignal DTO failed consumption re-validation (price moved since createSignal), dropped at-most-once";
          const payload = {
            symbol: self.params.execution.context.symbol,
            strategyName: self.params.strategyName,
            dtoId: userDto.id,
            note: userDto.note,
            currentPrice,
          };
          self.params.logger.warn(message, payload);
          console.warn(message, payload);
          errorEmitter.next(new Error(message));
          self._lastSignalTimestamp = null;
          return null;
        }
        signal = userDto;
      }
      self._userSignal = null;
    }

    if (typeof signal === "symbol") {
      throw new Error(`Timeout for ${self.params.method.context.strategyName} symbol=${self.params.execution.context.symbol}`);
    }
    if (!signal) {
      return null;
    }
    if (signal?.symbol && signal?.symbol !== self.params.execution.context.symbol) {
      throw new Error(`Symbol mismatch: expected ${self.params.execution.context.symbol}, got ${signal.symbol}`);
    }
    // Whipsaw protection: skip signal if its id matches the last accepted pending id
    if (signal.id && signal.id === self._lastPendingId) {
      return null;
    }
    if (self._isStopped) {
      return null;
    }
    // Risk check for every candidate signal (reserves a slot). The reservation is
    // finalized by addSignal on a successful open, released on sync rejection /
    // scheduled cancellation, and released by the trycatch fallback below if a
    // validate* call throws after this point (previously that leak left a stale
    // placeholder in the shared risk map). OPEN_NEW_PENDING_SIGNAL_FN deliberately
    // does NOT re-check: user validations must run once per open attempt.
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
      // Roll back the interval throttle consumed at the top of this function so
      // the rejected open retries on the NEXT TICK, not on the next interval
      // boundary (for "1h" that would be up to an hour of silence). Risk
      // validations will run again on every retry tick until they pass.
      self._lastSignalTimestamp = null;
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
        // The spread comes FIRST (mirrors the no-priceOpen branch below): custom
        // user DTO fields must survive into the row; every known key is
        // overridden by the explicit values that follow.
        const signalRow: ISignalRow = {
          ...structuredClone(signal),
          id: signal.id || randomString(),
          cost: signal.cost || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST,
          priceOpen: signal.priceOpen, // Используем priceOpen из сигнала
          position: signal.position,
          note: signal.note || "",
          priceTakeProfit: signal.priceTakeProfit,
          priceStopLoss: signal.priceStopLoss,
          minuteEstimatedTime: signal.minuteEstimatedTime ?? GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES,
          symbol: self.params.execution.context.symbol,
          exchangeName: self.params.method.context.exchangeName,
          strategyName: self.params.method.context.strategyName,
          frameName: self.params.method.context.frameName,
          scheduledAt: currentTime,
          pendingAt: currentTime, // Для immediate signal оба времени одинаковые
          timestamp: currentTime,
          _isScheduled: false,
          _entry: [{ price: signal.priceOpen, cost: signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, timestamp: currentTime }],
          _peak: { price: signal.priceOpen, timestamp: currentTime, pnlPercentage: 0, pnlCost: 0, priceClose: 0, priceOpen: 0, pnlEntries: 0 },
          _fall: { price: signal.priceOpen, timestamp: currentTime, pnlPercentage: 0, pnlCost: 0, priceClose: 0, priceOpen: 0, pnlEntries: 0 },
        };
        {
          const { pnlPercentage, pnlCost, pnlEntries, priceClose, priceOpen } = toProfitLossDto(signalRow, signal.priceOpen);
          signalRow._fall = { price: signal.priceOpen, timestamp: currentTime, pnlPercentage, pnlCost, priceClose, priceOpen, pnlEntries };
        }

        // Валидируем сигнал перед возвратом
        validatePendingSignal(signalRow, currentPrice);

        // NOTE: _lastPendingId (whipsaw protection) is recorded on SUCCESSFUL open
        // (after the sync-open confirmation), not here — otherwise a sync/risk
        // rejection would permanently block a deterministic signal id from retrying.

        return signalRow;
      }

      // ОЖИДАНИЕ АКТИВАЦИИ: создаем scheduled signal (risk check при активации)
      // The spread comes FIRST (mirrors the no-priceOpen branch below): custom
      // user DTO fields must survive into the row; every known key is
      // overridden by the explicit values that follow.
      const scheduledSignalRow: IScheduledSignalRow = {
        ...structuredClone(signal),
        id: signal.id || randomString(),
        cost: signal.cost || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST,
        priceOpen: signal.priceOpen,
        position: signal.position,
        note: signal.note || "",
        priceTakeProfit: signal.priceTakeProfit,
        priceStopLoss: signal.priceStopLoss,
        minuteEstimatedTime: signal.minuteEstimatedTime ?? GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES,
        symbol: self.params.execution.context.symbol,
        exchangeName: self.params.method.context.exchangeName,
        strategyName: self.params.method.context.strategyName,
        frameName: self.params.method.context.frameName,
        scheduledAt: currentTime,
        pendingAt: SCHEDULED_SIGNAL_PENDING_MOCK, // Временно, обновится при активации
        timestamp: currentTime,
        _isScheduled: true,
        _entry: [{ price: signal.priceOpen, cost: signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, timestamp: currentTime }],
        _peak: { price: signal.priceOpen, timestamp: currentTime, pnlPercentage: 0, pnlCost: 0, priceClose: 0, priceOpen: 0, pnlEntries: 0 },
        _fall: { price: signal.priceOpen, timestamp: currentTime, pnlPercentage: 0, pnlCost: 0, priceClose: 0, priceOpen: 0, pnlEntries: 0 },
      };

      // Валидируем сигнал перед возвратом
      validateScheduledSignal(scheduledSignalRow, currentPrice);

      return scheduledSignalRow;
    }

    // The spread comes FIRST: a DTO carrying its own `undefined` keys (id,
    // cost, priceOpen) must not override the defaults below — an `undefined`
    // priceOpen would fail validation and silently drop the signal.
    const signalRow: ISignalRow = {
      ...structuredClone(signal),
      id: signal.id || randomString(),
      cost: signal.cost || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST,
      priceOpen: currentPrice,
      note: signal.note || "",
      minuteEstimatedTime: signal.minuteEstimatedTime ?? GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES,
      symbol: self.params.execution.context.symbol,
      exchangeName: self.params.method.context.exchangeName,
      strategyName: self.params.method.context.strategyName,
      frameName: self.params.method.context.frameName,
      scheduledAt: currentTime,
      pendingAt: currentTime, // Для immediate signal оба времени одинаковые
      timestamp: currentTime,
      _isScheduled: false,
      _entry: [{ price: currentPrice, cost: signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, timestamp: currentTime }],
      _peak: { price: currentPrice, timestamp: currentTime, pnlPercentage: 0, pnlCost: 0, priceClose: 0, priceOpen: 0, pnlEntries: 0 },
      _fall: { price: currentPrice, timestamp: currentTime, pnlPercentage: 0, pnlCost: 0, priceClose: 0, priceOpen: 0, pnlEntries: 0 },
    };
    {
      const { pnlPercentage, pnlCost, pnlEntries, priceClose, priceOpen } = toProfitLossDto(signalRow, currentPrice);
      signalRow._fall = { price: currentPrice, timestamp: currentTime, pnlPercentage, pnlCost, priceClose, priceOpen, pnlEntries };
    }

    // Валидируем сигнал перед возвратом
    validatePendingSignal(signalRow, currentPrice);

    return signalRow;
  },
  {
    defaultValue: null,
    fallback: (error, self) => {
      const message = "ClientStrategy GET_SIGNAL_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
      // A throw after a successful checkSignalAndReserve (e.g. validate* rejected
      // the built row) would otherwise leak the reservation in the shared risk
      // map. No pending/scheduled signal exists while GET_SIGNAL_FN runs, so any
      // placeholder under this key belongs to the failed attempt — release it.
      // Fire-and-forget: CALL_RISK_REMOVE_SIGNAL_FN has its own trycatch.
      void CALL_RISK_REMOVE_SIGNAL_FN(
        self,
        self.params.execution.context.symbol,
        self.params.execution.context.when.getTime(),
        self.params.execution.context.backtest
      );
    },
  }
);

/**
 * Progress (0-100) of the covered distance toward TP/SL.
 *
 * A non-positive total distance is reachable (e.g. breakeven moved the SL exactly
 * to the effective entry, or a rejected sync close fell through to monitoring) and
 * means the level is already at/behind the entry — report 100 instead of dividing
 * by zero. The result is clamped to [0, 100] on both sides.
 */
const GET_PROGRESS_PERCENT_FN = (coveredDistance: number, totalDistance: number): number => {
  if (totalDistance <= 0) {
    return 100;
  }
  const progressPercent = (coveredDistance / totalDistance) * 100;
  return Math.min(Math.max(progressPercent, 0), 100);
};

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

// Static reads (like WAIT_FOR_DISPOSE_FN): symbol/strategyName/exchangeName/
// frameName/backtest come from ctor params — the same values the instance is
// memoized by — so those no longer touch method/execution contexts. The RESTORE
// branches (persisted pending/scheduled found) still require the execution
// context: they read execution.context.when for callback timestamps and call
// exchange.getAveragePrice, which reads it internally for the candle window.
// Time is genuinely contextual (simulated in tests/replay) — the wall clock is
// NOT a substitute. The empty-restore path is context-free.
const WAIT_FOR_INIT_FN = async (self: ClientStrategy) => {
  self.params.logger.debug("ClientStrategy waitForInit");
  if (self.params.backtest) {
    return;
  }

  // Restore last pending signal id for whipsaw protection in GET_SIGNAL_FN
  {
    const recentSignal = await PersistRecentAdapter.readRecentData(
      self.params.symbol,
      self.params.strategyName,
      self.params.exchangeName,
      self.params.frameName,
      false,
    );
    if (recentSignal?.id) {
      self._lastPendingId = recentSignal.id;
    }
  }

  // Read deferred strategy state (commit queue + deferred user actions) so any
  // confirmed-but-not-yet-forwarded broker operation survives a live crash and is
  // re-drained on the next tick. Read here, before the pending restore which may
  // early-return on exchange/strategy mismatch.
  // No context-match check here (unlike the pending restore below): the default
  // adapter keys this snapshot by the same symbol/strategy/exchange triple, and the
  // snapshot itself carries no context fields to verify against, so a check is
  // impossible for custom adapters anyway.
  const strategyData = await PersistStrategyAdapter.readStrategyData(
    self.params.symbol,
    self.params.strategyName,
    self.params.exchangeName,
  );
  if (strategyData) {
    // Deferred user actions are restored unconditionally. They are persisted BEFORE
    // the pending/scheduled snapshot is wiped from disk (write-ahead order), so a
    // crash between those two writes can leave a stale pending/scheduled snapshot
    // alongside them — the restore blocks below detect that by id and finish the
    // interrupted wipe instead of restoring. A queued createSignal is a
    // not-yet-consumed signal source and likewise stands on its own.
    self._userSignal = strategyData.createdSignal;
    self._closedSignal = strategyData.closedSignal;
    self._cancelledSignal = strategyData.cancelledSignal;
    self._activatedSignal = strategyData.activatedSignal;
    // Deferred broker-confirmed TP/SL fills snapshot the pending signal and clear it (like
    // _closedSignal), so they stand on their own and are restored unconditionally too.
    self._takeProfitSignal = strategyData.takeProfitSignal;
    self._stopLossSignal = strategyData.stopLossSignal;

    // Restore the commit queue when its attribution target is the deferred USER
    // close snapshot (closePending / full-partial auto-close): that snapshot has
    // pendingSignalId already null, so the pending-id match below cannot apply,
    // yet PROCESS_COMMIT_QUEUE_FN attributes drained ops to _closedSignal — the
    // non-crash flow delivers them, so dropping the queue here would lose
    // broker-confirmed operations only because a restart happened in between.
    // Broker-confirmed TP/SL fill snapshots intentionally do NOT restore the
    // queue: those ops are void (see the orphaned-queue recovery test).
    if (strategyData.closedSignal) {
      self._commitQueue = strategyData.commitQueue ?? [];
      // Restore the started-close-attempts counter for the deferred user-close drain,
      // CLAMPED to 1: through a restart only the `attempt >= 1` bit matters ("a prior
      // exit order MAY have reached the exchange — reconcile before re-sending").
      // Carrying the full pre-crash streak would let yesterday's network outage burn
      // today's retry budget and force-close on the first post-restart rejection.
      self._retryCloseCount = Math.min(strategyData.retryCloseCount ?? 0, 1);
    }

    // Restore the armed open-retry slot (gate-rejected open awaiting an
    // identity-stable retry) and its per-signalId rejection counter. Restored
    // unconditionally like the other deferred slots: the retry is write-ahead —
    // it stays on disk until the open outcome is durable, so a crash right after
    // the broker confirmed the open (but before the pending snapshot was written)
    // replays the SAME signalId and the idempotent adapter reconciles instead of
    // double-buying. Skipped when retries are disabled (slot stays unused; a
    // snapshot armed under an older config is dropped on the next persist).
    if (GLOBAL_CONFIG.CC_ORDER_OPEN_RETRY_ATTEMPTS > 0) {
      self._retryOpenSignal = strategyData.retryOpenSignal ?? null;
      // CLAMPED to 1: through a restart only the `attempt >= 1` reconcile bit matters
      // ("a prior order MAY have reached the exchange"); the full pre-crash streak
      // must not burn the fresh retry budget — a stale streak from a long outage
      // would otherwise drop the signal on the first post-restart rejection.
      self._retryOpenCount = Math.min(strategyData.retryOpenCount ?? 0, 1);
      // JSON serializes Infinity as null: restore eternal-hold rows the same way
      // as the pending/scheduled snapshots below.
      if (self._retryOpenSignal && self._retryOpenSignal.minuteEstimatedTime == null) {
        self._retryOpenSignal.minuteEstimatedTime = Infinity;
      }
    }
  }

  // Restore pending signal. A context mismatch skips ONLY this block (not an
  // early return): the scheduled restore below and the onInit call must still run.
  const pendingSignal = await PersistSignalAdapter.readSignalData(
    self.params.symbol,
    self.params.strategyName,
    self.params.exchangeName,
  );
  const pendingMatches = pendingSignal
    && pendingSignal.exchangeName === self.params.exchangeName
    && pendingSignal.strategyName === self.params.strategyName;
  if (pendingSignal && !pendingMatches) {
    self.params.logger.warn("ClientStrategy waitForInit: persisted pending signal context mismatch, skipping restore", {
      symbol: self.params.symbol,
      signalId: pendingSignal.id,
      persistedExchangeName: pendingSignal.exchangeName,
      persistedStrategyName: pendingSignal.strategyName,
    });
  }
  // Write-ahead reconciliation: a deferred close/fill snapshot (persisted FIRST)
  // may coexist with a stale on-disk pending snapshot when the process crashed
  // between the two writes. The deferred snapshot supersedes the pending one —
  // restoring the pending would resurrect a position that is already closing, and
  // after the deferred drains a later restart would revive it as a zombie. Skip
  // the restore and finish the interrupted wipe instead.
  if (pendingMatches && (
    self._closedSignal?.id === pendingSignal.id
    || self._takeProfitSignal?.id === pendingSignal.id
    || self._stopLossSignal?.id === pendingSignal.id
  )) {
    self.params.logger.warn("ClientStrategy waitForInit: persisted pending signal superseded by deferred close/fill, skipping restore", {
      symbol: self.params.symbol,
      signalId: pendingSignal.id,
    });
    await PersistSignalAdapter.writeSignalData(
      null,
      self.params.symbol,
      self.params.strategyName,
      self.params.exchangeName,
    );
  } else if (pendingMatches) {
    // JSON serializes Infinity as null: an eternal-hold signal (minuteEstimatedTime:
    // Infinity) reads back as null. Restore it so the position is not immediately
    // time-expired on restore (guards custom persist adapters too).
    if (pendingSignal.minuteEstimatedTime == null) {
      pendingSignal.minuteEstimatedTime = Infinity;
    }
    self._pendingSignal = pendingSignal;

    // Restore the commit queue only if the snapshot belongs to this exact pending
    // signal (pendingSignalId === restored id). The queue holds confirmed-but-not-yet
    // forwarded broker ops (average-buy / partial-* / trailing-* / breakeven) that are
    // always tied to the active position; a mismatch means the snapshot is stale and
    // the queue is dropped to avoid replaying ops against the wrong position.
    if (strategyData && strategyData.pendingSignalId === pendingSignal.id) {
      self._commitQueue = strategyData.commitQueue ?? [];
      // Same id-gated rule for the started-close-attempts counter: it belongs to
      // exactly this position. CLAMPED to 1 — through a restart only the
      // `attempt >= 1` reconcile bit matters; the full pre-crash streak must not
      // burn the fresh budget (a day-old outage would force-close on the first
      // post-restart rejection otherwise).
      self._retryCloseCount = Math.min(strategyData.retryCloseCount ?? 0, 1);
    }

    // Call onActive callback for restored signal.
    // NOTE: the restore branch reads execution.context.when — time is genuinely
    // contextual (simulated in tests/replay), the wall clock is NOT a substitute.
    // ClientExchange also reads it internally for the candle window.
    const currentPrice = await self.params.exchange.getAveragePrice(
      self.params.symbol
    );
    const currentTime = self.params.execution.context.when.getTime();

    // Re-assert the risk slot for the restored position. The risk map and the
    // signal snapshot live in SEPARATE persist adapters, so a crash can land
    // between a risk write and a signal write — leaving the position alive
    // without its slot (concurrency-limit undercount). addSignal keys by
    // strategy:exchange:symbol, so re-adding is an idempotent overwrite; the
    // original pendingAt anchors the slot's lifetime to the real open, not the
    // restart. (A lost SCHEDULED reservation needs no such re-assert: activation
    // re-runs checkSignalAndReserve, which restores it naturally.)
    await CALL_RISK_ADD_SIGNAL_FN(
      self,
      self.params.symbol,
      pendingSignal,
      pendingSignal.pendingAt,
      self.params.backtest
    );

    await CALL_ACTIVE_CALLBACKS_FN(
      self,
      self.params.symbol,
      pendingSignal,
      currentPrice,
      currentTime,
      self.params.backtest
    );
  }

  // Restore scheduled signal. Same rule: a mismatch skips only this block so
  // the onInit call below always runs.
  const scheduledSignal = await PersistScheduleAdapter.readScheduleData(
    self.params.symbol,
    self.params.strategyName,
    self.params.exchangeName,
  );
  const scheduledMatches = scheduledSignal
    && scheduledSignal.exchangeName === self.params.exchangeName
    && scheduledSignal.strategyName === self.params.strategyName;
  if (scheduledSignal && !scheduledMatches) {
    self.params.logger.warn("ClientStrategy waitForInit: persisted scheduled signal context mismatch, skipping restore", {
      symbol: self.params.symbol,
      signalId: scheduledSignal.id,
      persistedExchangeName: scheduledSignal.exchangeName,
      persistedStrategyName: scheduledSignal.strategyName,
    });
  }
  // Same write-ahead reconciliation for the scheduled snapshot: a deferred
  // cancel/activate (persisted FIRST) supersedes a stale on-disk scheduled
  // snapshot left by a crash between the two writes. An already-restored
  // pending with the same id supersedes it too: activation persists the
  // pending BEFORE wiping the scheduled, so a crash in that window leaves
  // both snapshots — the position is live, the scheduled row is stale.
  if (scheduledMatches && (
    self._cancelledSignal?.id === scheduledSignal.id
    || self._activatedSignal?.id === scheduledSignal.id
    || self._pendingSignal?.id === scheduledSignal.id
  )) {
    self.params.logger.warn("ClientStrategy waitForInit: persisted scheduled signal superseded by deferred cancel/activate or activated pending, skipping restore", {
      symbol: self.params.symbol,
      signalId: scheduledSignal.id,
    });
    await PersistScheduleAdapter.writeScheduleData(
      null,
      self.params.symbol,
      self.params.strategyName,
      self.params.exchangeName,
    );
  } else if (scheduledMatches) {
    // JSON serializes Infinity as null: an eternal-hold signal (minuteEstimatedTime:
    // Infinity) reads back as null. Restore it so the position is not immediately
    // time-expired on activation (guards custom persist adapters too).
    if (scheduledSignal.minuteEstimatedTime == null) {
      scheduledSignal.minuteEstimatedTime = Infinity;
    }
    self._scheduledSignal = scheduledSignal;

    // Call onSchedule callback for restored scheduled signal.
    // Same as the pending restore above: execution.context.when is required here.
    const currentPrice = await self.params.exchange.getAveragePrice(
      self.params.symbol
    );
    const currentTime = self.params.execution.context.when.getTime();
    await CALL_SCHEDULE_CALLBACKS_FN(
      self,
      self.params.symbol,
      scheduledSignal,
      currentPrice,
      currentTime,
      self.params.backtest
    );
  }

  // Write-ahead reconciliation for the open-retry slot: a restored retry row whose id
  // matches the restored pending/scheduled snapshot means the crash happened AFTER the
  // broker confirmed the open but BEFORE the slot wipe was persisted — the position is
  // live, the retry row is stale. Finish the interrupted wipe instead of re-opening.
  if (self._retryOpenSignal && (
    self._pendingSignal?.id === self._retryOpenSignal.id
    || self._scheduledSignal?.id === self._retryOpenSignal.id
  )) {
    self.params.logger.warn("ClientStrategy waitForInit: persisted open-retry slot superseded by restored pending/scheduled signal, finishing wipe", {
      symbol: self.params.symbol,
      signalId: self._retryOpenSignal.id,
    });
    self._retryOpenSignal = null;
    self._retryOpenCount = 0;
    await PERSIST_STRATEGY_FN(self);
  }

  // Call onInit callback
  await self.params.onInit(
    self.params.symbol,
    self.params.strategyName,
    self.params.exchangeName,
    self.params.frameName,
    self.params.backtest
  );
};

const WAIT_FOR_DISPOSE_FN = async (self: ClientStrategy) => {
  self.params.logger.debug("ClientStrategy dispose");
  await self.params.onDispose(
    self.params.symbol,
    self.params.strategyName,
    self.params.exchangeName,
    self.params.frameName,
    self.params.backtest
  );
};

/**
 * Persists the deferred strategy state snapshot (commit queue + deferred user actions)
 * to disk in live mode.
 *
 * These fields carry confirmed-but-not-yet-forwarded broker operations and survive the
 * gap between ticks (drained at the start of the next tick). Without persistence a live
 * crash in that window silently loses the pending broker operation while _pendingSignal
 * (already mutated and saved) claims it happened. Skipped in backtest mode.
 *
 * @param self - ClientStrategy instance
 */
const PERSIST_STRATEGY_FN = async (self: ClientStrategy): Promise<void> => {
  if (self.params.backtest) {
    return;
  }
  await PersistStrategyAdapter.writeStrategyData(
    {
      pendingSignalId: self._pendingSignal?.id ?? null,
      createdSignal: self._userSignal,
      commitQueue: self._commitQueue,
      closedSignal: self._closedSignal,
      cancelledSignal: self._cancelledSignal,
      activatedSignal: self._activatedSignal,
      takeProfitSignal: self._takeProfitSignal,
      stopLossSignal: self._stopLossSignal,
      retryOpenSignal: self._retryOpenSignal,
      retryOpenCount: self._retryOpenCount,
      retryCloseCount: self._retryCloseCount,
    },
    self.params.symbol,
    self.params.strategyName,
    self.params.exchangeName,
  );
};

/**
 * PRE-ARMS the identity-stable open retry BEFORE the gate call (write-ahead of the
 * attempt itself, not of its rejection).
 *
 * Called from OPEN_NEW_PENDING_SIGNAL_FN / OPEN_NEW_SCHEDULED_SIGNAL_FN right before
 * CALL_ORDER_SYNC_OPEN_FN / CALL_ORDER_SYNC_SCHEDULE_OPEN_FN. The counter tracks
 * attempts STARTED (not rejections): it increments here and persists together with the
 * signal row, so a crash AFTER the order was POSTed but BEFORE the gate verdict still
 * leaves the armed slot on disk — the restart re-submits the SAME signalId with
 * `attempt = count - 1 >= 1`, and an idempotent adapter reconciles the possibly-filled
 * order (query by clientOrderId BEFORE re-sending; on Binance the duplicate guard only
 * covers OPEN orders, an instantly-filled one would NOT dup) instead of double-buying.
 *
 * A transient rejection does NOT touch the counter (the start was already counted);
 * exhaustion is checked at consumption in GET_SIGNAL_FN. No-op when
 * CC_ORDER_OPEN_RETRY_ATTEMPTS is 0 (legacy drop-and-regenerate, attempt stays 0).
 */
const ARM_RETRY_OPEN_SIGNAL_FN = async (
  self: ClientStrategy,
  signal: ISignalRow | IScheduledSignalRow
): Promise<void> => {
  if (GLOBAL_CONFIG.CC_ORDER_OPEN_RETRY_ATTEMPTS <= 0) {
    return;
  }
  self._retryOpenCount = self._retryOpenSignal?.id === signal.id ? self._retryOpenCount + 1 : 1;
  self._retryOpenSignal = signal;
  // Write-ahead: persist the armed attempt BEFORE the gate call so ANY crash from this
  // point on restores the same signalId (orphan-order risk closed for the whole attempt).
  await PERSIST_STRATEGY_FN(self);
};

/**
 * Handles the TERMINAL open-gate rejection (verdict "rejected"/"deleted": the broker
 * threw OrderRejectedError — "no counterparty, retrying is pointless").
 *
 * Unlike the transient branch (STASH_RETRY_OPEN_SIGNAL_FN) the open is dropped for
 * good: no retry is armed, and an already-armed retry slot for this id is wiped so
 * the exhausted trade attempt does not resurrect on the next tick or after a restart.
 */
const DROP_RETRY_OPEN_SIGNAL_FN = async (
  self: ClientStrategy,
  signal: ISignalRow | IScheduledSignalRow
): Promise<void> => {
  const message = "ClientStrategy DROP_RETRY_OPEN_SIGNAL_FN: terminal broker rejection, open dropped without retry";
  const payload = {
    symbol: self.params.execution.context.symbol,
    strategyName: self.params.strategyName,
    signalId: signal.id,
    note: signal.note,
    attempts: self._retryOpenSignal?.id === signal.id ? self._retryOpenCount : 0,
  };
  self.params.logger.warn(message, payload);
  console.warn(message, payload);
  if (self._retryOpenSignal?.id === signal.id) {
    self._retryOpenSignal = null;
    self._retryOpenCount = 0;
    await PERSIST_STRATEGY_FN(self);
  }
};

/**
 * Resolves the close-gate outcome into an actionable verdict:
 *
 * - "allow" — the broker confirmed the close; the consecutive-rejection counter resets.
 * - "retry" — transient rejection within CC_ORDER_CLOSE_RETRY_ATTEMPTS; the caller keeps
 *   the position open and re-attempts the close on the next tick/candle (the next gate
 *   event carries the incremented `attempt`).
 * - "force" — attempts exhausted OR terminal rejection (OrderRejectedError): the caller
 *   proceeds with the close teardown WITHOUT broker confirmation, loudly (errorEmitter).
 *   The engine records the close with the original closeReason; the adapter/operator
 *   must reconcile the real exchange position (the standard signal-close lifecycle
 *   event still fires and reaches the broker adapter). Rationale: an eternally rejected
 *   close blocks the risk slot and floods logs forever.
 *
 * CC_ORDER_CLOSE_RETRY_ATTEMPTS = 0 disables the cap: transient rejections retry
 * forever (legacy behavior); the terminal verdict still forces the close.
 */
const RESOLVE_CLOSE_GATE_FN = (
  self: ClientStrategy,
  verdict: IBrokerOrderVerdict,
  signal: ISignalRow,
  closeReason: string
): "allow" | "retry" | "force" => {
  if (verdict.reason === "confirmed") {
    self._retryCloseCount = 0;
    return "allow";
  }
  // The started attempt was already counted by the PRE-ARM inside
  // CALL_ORDER_SYNC_CLOSE_FN — no increment here.
  const terminal = verdict.reason !== "transient";
  const exhausted = terminal
    || (GLOBAL_CONFIG.CC_ORDER_CLOSE_RETRY_ATTEMPTS > 0
      && self._retryCloseCount > GLOBAL_CONFIG.CC_ORDER_CLOSE_RETRY_ATTEMPTS);
  if (!exhausted) {
    return "retry";
  }
  const message = "ClientStrategy RESOLVE_CLOSE_GATE_FN: close attempts exhausted, force-closing engine state without broker confirmation";
  const payload = {
    symbol: self.params.execution.context.symbol,
    strategyName: self.params.strategyName,
    signalId: signal.id,
    closeReason,
    attempts: self._retryCloseCount,
    terminal,
  };
  self.params.logger.warn(message, payload);
  console.warn(message, payload);
  const error = new Error(message);
  errorEmitter.next(error);
  if (!terminal) {
    // Исчерпание ТРАНЗИЕНТНЫХ отказов = сеть/брокер не дают закрыть позицию —
    // продолжать работу нельзя: фатальный сигнал ПОСЛЕ errorEmitter-лога (движок
    // уже force-close'нул своё состояние, реальную позицию обязан выверить
    // оператор/адаптер). Терминальный OrderRejectedError — бизнес-исход, не сеть:
    // без exit.
    exitEmitter.next(error);
  }
  self._retryCloseCount = 0;
  return "force";
};

const PARTIAL_PROFIT_FN = (
  self: ClientStrategy,
  signal: ISignalRow,
  percentToClose: number,
  currentPrice: number,
  timestamp: number
): boolean => {
  // Initialize partial array if not present
  if (!signal._partial) signal._partial = [];

  // Check if would exceed 100% total closed (dollar-basis, DCA-aware)
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed(signal);
  const totalInvested = (signal._entry ?? []).reduce((s, e) => s + e.cost, 0) || (signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST);
  const newPartialDollar = (percentToClose / 100) * remainingCostBasis;
  const newTotalClosedDollar = (totalClosedPercent / 100) * totalInvested + newPartialDollar;

  if (newTotalClosedDollar > totalInvested * PARTIAL_CAP_TOLERANCE_FACTOR) {
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
    timestamp,
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
  currentPrice: number,
  timestamp: number
): boolean => {
  // Initialize partial array if not present
  if (!signal._partial) signal._partial = [];

  // Check if would exceed 100% total closed (dollar-basis, DCA-aware)
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed(signal);
  const totalInvested = (signal._entry ?? []).reduce((s, e) => s + e.cost, 0) || (signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST);
  const newPartialDollar = (percentToClose / 100) * remainingCostBasis;
  const newTotalClosedDollar = (totalClosedPercent / 100) * totalInvested + newPartialDollar;

  if (newTotalClosedDollar > totalInvested * PARTIAL_CAP_TOLERANCE_FACTOR) {
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
    timestamp,
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
    // When CC_ENABLE_TRAILING_EVERYWHERE is true, absorption check is skipped
    let shouldUpdate = false;

    if (GLOBAL_CONFIG.CC_ENABLE_TRAILING_EVERYWHERE) {
      shouldUpdate = true;
    } else if (signal.position === "long") {
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
    // When CC_ENABLE_TRAILING_EVERYWHERE is true, absorption check is skipped
    let shouldUpdate = false;

    if (GLOBAL_CONFIG.CC_ENABLE_TRAILING_EVERYWHERE) {
      shouldUpdate = true;
    } else if (signal.position === "long") {
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
  // Total: (slippage + fee) * 2 transactions, plus the configured extra margin
  // (CC_BREAKEVEN_THRESHOLD) — keep in sync with getBreakeven/validateBreakeven
  const breakevenThresholdPercent =
    (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2 + GLOBAL_CONFIG.CC_BREAKEVEN_THRESHOLD;

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
  timestamp: number,
  cost: number = GLOBAL_CONFIG.CC_POSITION_ENTRY_COST
): boolean => {
  // Ensure _entry is initialized (handles signals loaded from disk without _entry).
  // Use the signal's own cost — falling back to CC_POSITION_ENTRY_COST for a
  // position opened with a custom cost would corrupt the whole dollar PnL basis.
  if (!signal._entry || signal._entry.length === 0) {
    signal._entry = [{ price: signal.priceOpen, cost: signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, timestamp }];
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

  signal._entry.push({ price: currentPrice, cost, timestamp });

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

  // Release the slot reserved at scheduled-signal creation
  await CALL_RISK_REMOVE_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    currentTime,
    self.params.execution.context.backtest
  );

  await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, currentPrice, currentTime, "timeout");

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
    signal: TO_PUBLIC_SIGNAL("scheduled", scheduled, currentPrice),
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

  // Release the slot reserved at scheduled-signal creation
  await CALL_RISK_REMOVE_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    currentTime,
    self.params.execution.context.backtest
  );

  await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, currentPrice, currentTime, "price_reject");

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
    signal: TO_PUBLIC_SIGNAL("scheduled", scheduled, currentPrice),
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

/**
 * Cancels the scheduled signal after the scheduled-order ping reported the resting entry
 * order is no longer open on the exchange (CALL_SCHEDULED_ORDER_CHECK_FN returned false / threw).
 *
 * Mirrors CLOSE_PENDING_SIGNAL_AS_CLOSED_FN for the scheduled state: the ping already
 * established the order is gone, so this does NOT re-confirm anything — it runs the standard
 * cancel teardown (risk release, schedule event "cancelled" reason "user", cancel callbacks,
 * cancelled tick result). The schedule event still reaches Broker.commitScheduleCancelled;
 * cancelling an already-gone order is a no-op on the adapter side. Live-only path.
 */
const CANCEL_SCHEDULED_SIGNAL_AS_CLOSED_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  currentPrice: number
): Promise<IStrategyTickResultCancelled> => {
  self.params.logger.info("ClientStrategy scheduled signal cancelled by scheduled-order ping (order no longer open on exchange)", {
    symbol: self.params.execution.context.symbol,
    signalId: scheduled.id,
    position: scheduled.position,
    averagePrice: currentPrice,
    priceOpen: scheduled.priceOpen,
  });

  await self.setScheduledSignal(null);

  const currentTime = self.params.execution.context.when.getTime();

  // Release the slot reserved at scheduled-signal creation
  await CALL_RISK_REMOVE_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    currentTime,
    self.params.execution.context.backtest
  );

  await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, currentPrice, currentTime, "user");

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
    signal: TO_PUBLIC_SIGNAL("scheduled", scheduled, currentPrice),
    currentPrice: currentPrice,
    closeTimestamp: currentTime,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    reason: "user",
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
    // Release the slot reserved at scheduled-signal creation
    await CALL_RISK_REMOVE_SIGNAL_FN(
      self,
      self.params.execution.context.symbol,
      activationTimestamp,
      self.params.execution.context.backtest
    );
    // The signal is dropped for good — emit the cancellation so the broker
    // adapter cancels the real resting order and subscribers (commit +
    // schedule event) see the drop instead of the signal silently vanishing.
    // Emitted synchronously in this branch on purpose: setScheduledSignal(null)
    // above wipes a _cancelledSignal deferred by a concurrent stopStrategy, so
    // this is the single emission point in that race (the wipe acts as dedup).
    {
      const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, scheduled.priceOpen);
      await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, scheduled.priceOpen, activationTimestamp, "user");
      await CALL_COMMIT_FN(self, {
        action: "cancel-scheduled",
        symbol: self.params.execution.context.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        signalId: scheduled.id,
        backtest: self.params.execution.context.backtest,
        timestamp: activationTimestamp,
        totalEntries: scheduled._entry?.length ?? 1,
        totalPartials: scheduled._partial?.length ?? 0,
        originalPriceOpen: scheduled.priceOpen,
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
        note: scheduled.note,
      });
    }
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
    // Release the slot reserved at scheduled-signal creation (the activation
    // check above returned false, so no new reservation replaced it)
    await CALL_RISK_REMOVE_SIGNAL_FN(
      self,
      self.params.execution.context.symbol,
      activationTime,
      self.params.execution.context.backtest
    );
    // The signal is dropped for good — emit the cancellation so the broker
    // adapter cancels the real resting order and subscribers (commit +
    // schedule event) see the drop instead of the signal silently vanishing
    {
      const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, scheduled.priceOpen);
      await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, scheduled.priceOpen, activationTime, "user");
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
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
        note: scheduled.note,
      });
    }
    return null;
  }

  // КРИТИЧЕСКИ ВАЖНО: обновляем pendingAt при активации
  const activatedSignal: ISignalRow = {
    ...scheduled,
    pendingAt: activationTime,
    _isScheduled: false,
    _peak: { price: scheduled.priceOpen, timestamp: activationTime, pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceClose: 0, priceOpen: 0 },
    _fall: { price: scheduled.priceOpen, timestamp: activationTime, pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceClose: 0, priceOpen: 0 },
  };
  {
    const { pnlPercentage, pnlCost, pnlEntries, priceClose, priceOpen } = toProfitLossDto(activatedSignal, activatedSignal.priceOpen);
    activatedSignal._fall = { price: activatedSignal.priceOpen, timestamp: activationTime, pnlPercentage, pnlCost, pnlEntries, priceClose, priceOpen };
  }

  // Sync open: if external system rejects — cancel scheduled signal instead of opening
  const syncOpenAllowed = await CALL_ORDER_SYNC_OPEN_FN(
    activationTime,
    activatedSignal.priceOpen,
    activatedSignal,
    self
  );

  if (syncOpenAllowed.reason !== "confirmed") {
    self.params.logger.info("ClientStrategy scheduled signal activation rejected by sync", {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
    });
    await self.setScheduledSignal(null);
    // Release the slot reserved by checkSignalAndReserve above
    await CALL_RISK_REMOVE_SIGNAL_FN(
      self,
      self.params.execution.context.symbol,
      activationTime,
      self.params.execution.context.backtest
    );
    const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, scheduled.priceOpen);
    // Notify the broker channel too — commit alone bypasses Broker.commitScheduleCancelled,
    // leaving the real resting order alive on the exchange
    await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, scheduled.priceOpen, activationTime, "user");
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
      pnl: publicSignal.pnl,
      maxDrawdown: publicSignal.maxDrawdown,
      peakProfit: publicSignal.peakProfit,
      signal: publicSignal,
      note: scheduled.note,
    });
    return null;
  }

  // Write-ahead order: persist the activated pending FIRST, wipe the scheduled
  // snapshot second — a crash between the writes leaves both on disk and
  // waitForInit reconciles by id (the pending supersedes the same-id scheduled).
  // The reverse order lost a broker-confirmed open: neither snapshot survived,
  // leaving an orphaned live position on the exchange.
  await self.setPendingSignal(activatedSignal, activatedSignal.priceOpen);

  await self.setScheduledSignal(null);

  // Whipsaw protection: record the id only after a successful open
  self._lastPendingId = activatedSignal.id;

  await CALL_RISK_ADD_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    activatedSignal,
    activationTime,
    self.params.execution.context.backtest
  );

  await CALL_SIGNAL_EVENT_FN(self, "opened", self._pendingSignal, self._pendingSignal.priceOpen, activationTime);

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
    signal: TO_PUBLIC_SIGNAL("pending", self._pendingSignal, self._pendingSignal.priceOpen),
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
    currentPrice: number,
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, currentPrice);

      // Call system onSchedulePing callback first (emits to pingSubject)
      await self.params.onSchedulePing(
        self.params.execution.context.symbol,
        self.params.method.context.strategyName,
        self.params.method.context.exchangeName,
        publicSignal,
        currentPrice,
        self.params.execution.context.backtest,
        timestamp
      );

      // Call user onSchedulePing callback only if signal is still active (not cancelled, not activated)
      if (self.params.callbacks?.onSchedulePing) {
        await self.params.callbacks.onSchedulePing(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_SCHEDULE_PING_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
    currentPrice: number,
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      const publicSignal = TO_PUBLIC_SIGNAL("pending", pending, currentPrice);

      // Call system onActivePing callback first (emits to activePingSubject)
      await self.params.onActivePing(
        self.params.execution.context.symbol,
        self.params.method.context.strategyName,
        self.params.method.context.exchangeName,
        publicSignal,
        currentPrice,
        self.params.execution.context.backtest,
        timestamp
      );

      // Call user onActivePing callback only if signal is still active (not closed)
      if (self.params.callbacks?.onActivePing) {
        await self.params.callbacks.onActivePing(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_ACTIVE_PING_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

const CALL_IDLE_PING_CALLBACKS_FN = trycatch(
  beginTime(async (
    self: ClientStrategy,
    symbol: string,
    timestamp: number,
    backtest: boolean,
    currentPrice: number,
  ): Promise<void> => {
    await ExecutionContextService.runInContext(async () => {
      // Call system onIdlePing callback (emits to idlePingSubject)
      await self.params.onIdlePing(
        self.params.execution.context.symbol,
        self.params.method.context.strategyName,
        self.params.method.context.exchangeName,
        currentPrice,
        self.params.execution.context.backtest,
        timestamp
      );
    }, {
      when: new Date(timestamp),
      symbol: symbol,
      backtest: backtest,
    })
  }),
  {
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_IDLE_PING_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
        const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
        await self.params.callbacks.onActive(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_ACTIVE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
        const publicSignal = TO_PUBLIC_SIGNAL("scheduled", signal, currentPrice);
        await self.params.callbacks.onSchedule(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_SCHEDULE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Emits a scheduled signal lifecycle event (creation / cancellation) to onScheduleEvent.
 *
 * Called when a scheduled signal is created (action "scheduled") or cancelled before activation
 * (action "cancelled" with reason timeout / price_reject / user). The scheduled -> active
 * transition is intentionally NOT emitted through this path.
 *
 * Unlike the CALL_*_CALLBACKS_FN helpers this does not run inside beginTime/runInContext: the
 * timestamp is passed explicitly by the caller (tick when / candle timestamp) and forwarded to
 * the connection-level emitter, mirroring how onSchedulePing carries its own timestamp.
 */
const CALL_SCHEDULE_EVENT_FN = trycatch(
  async (
    self: ClientStrategy,
    action: "scheduled" | "cancelled",
    signal: ISignalRow | IScheduledSignalRow,
    currentPrice: number,
    timestamp: number,
    reason?: StrategyCancelReason
  ): Promise<void> => {
    await self.params.onScheduleEvent(
      action,
      self.params.execution.context.symbol,
      self.params.method.context.strategyName,
      self.params.method.context.exchangeName,
      TO_PUBLIC_SIGNAL("scheduled", signal, currentPrice),
      currentPrice,
      self.params.execution.context.backtest,
      timestamp,
      reason
    );
  },
  {
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_SCHEDULE_EVENT_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Emits a pending signal lifecycle event (open / close) to onSignalEvent.
 *
 * Called when a pending position is opened (action "opened") or closed (action "closed" with a
 * closeReason). Like CALL_SCHEDULE_EVENT_FN it does not run inside beginTime/runInContext: the
 * timestamp is passed explicitly by the caller (tick when / candle timestamp) and forwarded to
 * the connection-level emitter.
 */
const CALL_SIGNAL_EVENT_FN = trycatch(
  async (
    self: ClientStrategy,
    action: "opened" | "closed",
    signal: ISignalRow,
    currentPrice: number,
    timestamp: number,
    closeReason?: StrategyCloseReason
  ): Promise<void> => {
    await self.params.onSignalEvent(
      action,
      self.params.execution.context.symbol,
      self.params.method.context.strategyName,
      self.params.method.context.exchangeName,
      TO_PUBLIC_SIGNAL("pending", signal, currentPrice),
      currentPrice,
      self.params.execution.context.backtest,
      timestamp,
      closeReason
    );
  },
  {
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_SIGNAL_EVENT_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
        const publicSignal = TO_PUBLIC_SIGNAL("scheduled", signal, currentPrice);
        await self.params.callbacks.onCancel(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_CANCEL_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
        const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, priceOpen);
        await self.params.callbacks.onOpen(
          self.params.execution.context.symbol,
          publicSignal,
          priceOpen,
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_OPEN_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
        const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
        await self.params.callbacks.onClose(
          self.params.execution.context.symbol,
          publicSignal,
          currentPrice,
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_CLOSE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
          result.currentPrice,
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_TICK_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_IDLE_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_RISK_ADD_SIGNAL_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_RISK_REMOVE_SIGNAL_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
      const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_PARTIAL_CLEAR_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
      return await self.params.risk.checkSignalAndReserve({
        currentSignal: TO_PUBLIC_SIGNAL("scheduled", pendingSignal, currentPrice),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_RISK_CHECK_SIGNAL_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
      const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
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
          percentTp,
          currentPrice,
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_PARTIAL_PROFIT_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
      const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
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
          percentSl,
          currentPrice,
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_PARTIAL_LOSS_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
      const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
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
          new Date(timestamp),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_BREAKEVEN_CHECK_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
      const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_BREAKEVEN_CLEAR_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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
        signal: TO_PUBLIC_SIGNAL("pending", signal, signal.priceOpen),
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
    fallback: (error, self) => {
      const message = "ClientStrategy CALL_BACKTEST_SCHEDULE_OPEN_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
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

  const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, currentPrice);

  const result: IStrategyTickResultWaiting = {
    action: "waiting",
    signal: publicSignal,
    currentPrice: currentPrice,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    percentTp: 0,
    percentSl: 0,
    pnl: publicSignal.pnl,
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
): Promise<IStrategyTickResultScheduled | null> => {
  const currentPrice = await self.params.exchange.getAveragePrice(
    self.params.execution.context.symbol
  );

  const currentTime = self.params.execution.context.when.getTime();

  // PRE-ARM the identity-stable retry BEFORE the gate: the placement attempt is
  // write-ahead persisted, so a crash after the POST but before the verdict still
  // replays the SAME signalId with attempt >= 1 (adapter reconciles by clientOrderId).
  await ARM_RETRY_OPEN_SIGNAL_FN(self, signal);

  // Order sync (type "schedule"): confirm the resting entry order was PLACED on
  // the exchange BEFORE registering the scheduled signal — mirrors the type
  // "active" open gate in OPEN_NEW_PENDING_SIGNAL_FN (register/persist only
  // after broker confirmation).
  const syncOpenAllowed = await CALL_ORDER_SYNC_SCHEDULE_OPEN_FN(
    currentTime,
    currentPrice,
    signal,
    self
  );

  if (syncOpenAllowed.reason !== "confirmed") {
    self.params.logger.info("ClientStrategy OPEN_NEW_SCHEDULED_SIGNAL_FN rejected by sync", {
      symbol: self.params.execution.context.symbol,
      signalId: signal.id,
      reason: syncOpenAllowed.reason,
    });
    // Release the slot reserved by checkSignalAndReserve in GET_SIGNAL_FN —
    // otherwise the rejected placement leaks a phantom reservation in the shared risk map.
    await CALL_RISK_REMOVE_SIGNAL_FN(
      self,
      self.params.execution.context.symbol,
      currentTime,
      self.params.execution.context.backtest
    );
    if (syncOpenAllowed.reason === "transient") {
      // The retry is ALREADY armed (pre-armed before the gate) — the next tick
      // re-submits this row with the SAME signalId so an idempotent adapter
      // (clientOrderId = signalId, reconcile-before-send at attempt > 0) resolves a
      // lost-response placement instead of double-placing the resting order.
    } else {
      // Terminal rejection (OrderRejectedError): retrying is pointless — drop the
      // trade attempt for good and wipe an already-armed retry slot for this id.
      await DROP_RETRY_OPEN_SIGNAL_FN(self, signal);
    }
    // Roll back the interval throttle consumed in GET_SIGNAL_FN so the strategy
    // reacts on the NEXT TICK, not on the next interval boundary.
    self._lastSignalTimestamp = null;
    return null;
  }

  // Register/persist the scheduled signal only AFTER the broker confirmed the
  // resting order placement — registering earlier left a phantom scheduled
  // signal (and a persisted resting order that does not exist on the exchange).
  await self.setScheduledSignal(signal);

  // The gate confirmed this id — the retry accounting for it is complete. Finish the
  // write-ahead wipe of the retry slot (kept on disk until this durable outcome).
  // Placed BEFORE the stop-race branch below: the resting order is real either way.
  if (self._retryOpenSignal?.id === signal.id) {
    self._retryOpenSignal = null;
    self._retryOpenCount = 0;
    await PERSIST_STRATEGY_FN(self);
  }

  // Stop raced INTO the placement gate (flag raised after the pre-open checks
  // but before the broker confirmed). The resting order is REAL on the exchange
  // now, so it cannot be dropped silently: route it through the deferred-cancel
  // pipeline exactly like stopStrategy does — the next tick's _cancelledSignal
  // drain emits the cancel-scheduled commit + onScheduleEvent("cancelled") and
  // releases the risk reservation taken above.
  if (self._isStopped) {
    self.params.logger.info("ClientStrategy scheduled placement raced with stop, deferring cancel", {
      symbol: self.params.execution.context.symbol,
      signalId: signal.id,
    });
    self._scheduledSignal = null;
    if (!self._cancelledSignal) {
      self._cancelledSignal = Object.assign({}, signal, {
        cancelId: "stop_strategy",
        cancelNote: "stop_strategy",
      });
    }
    if (!self.params.execution.context.backtest) {
      // Write-ahead order: persist the deferred _cancelledSignal BEFORE wiping the
      // scheduled snapshot — a crash between the writes then leaves both on disk
      // and waitForInit reconciles by id (the reverse order lost the cancel).
      await PERSIST_STRATEGY_FN(self);
      await PersistScheduleAdapter.writeScheduleData(
        self._scheduledSignal,
        self.params.execution.context.symbol,
        self.params.strategyName,
        self.params.exchangeName,
      );
    }
    return null;
  }

  self.params.logger.info("ClientStrategy scheduled signal created", {
    symbol: self.params.execution.context.symbol,
    signalId: signal.id,
    position: signal.position,
    priceOpen: signal.priceOpen,
    currentPrice: currentPrice,
  });

  await CALL_SCHEDULE_EVENT_FN(self, "scheduled", signal, currentPrice, currentTime);

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
    signal: TO_PUBLIC_SIGNAL("scheduled", signal, currentPrice),
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

  // NOTE: the risk check (with slot reservation) already ran in GET_SIGNAL_FN for
  // this signal within the same tick. Re-checking here would run user risk
  // validations twice per open.

  // PRE-ARM the identity-stable retry BEFORE the gate: the attempt itself is
  // write-ahead persisted, so a crash after the POST but before the verdict still
  // replays the SAME signalId with attempt >= 1 (adapter reconciles by clientOrderId).
  await ARM_RETRY_OPEN_SIGNAL_FN(self, signal);

  // Sync open: if external system rejects — skip open, retry on the next tick
  // (the interval throttle is rolled back below).
  const syncOpenAllowed = await CALL_ORDER_SYNC_OPEN_FN(
    currentTime,
    signal.priceOpen,
    signal,
    self
  );

  if (syncOpenAllowed.reason !== "confirmed") {
    self.params.logger.info("ClientStrategy OPEN_NEW_PENDING_SIGNAL_FN rejected by sync", {
      symbol: self.params.execution.context.symbol,
      signalId: signal.id,
      reason: syncOpenAllowed.reason,
    });
    // Release the slot reserved by checkSignalAndReserve in GET_SIGNAL_FN —
    // otherwise the rejected open leaks a phantom reservation in the shared risk map.
    await CALL_RISK_REMOVE_SIGNAL_FN(
      self,
      self.params.execution.context.symbol,
      currentTime,
      self.params.execution.context.backtest
    );
    if (syncOpenAllowed.reason === "transient") {
      // The retry is ALREADY armed (pre-armed before the gate) — the next tick
      // re-submits this row with the SAME signalId so an idempotent adapter
      // (clientOrderId = signalId, reconcile-before-send at attempt > 0) resolves a
      // lost-response fill instead of double-buying. Exhaustion of the started-attempts
      // budget is checked at consumption in GET_SIGNAL_FN.
    } else {
      // Terminal rejection (OrderRejectedError): retrying is pointless — drop the
      // trade attempt for good and wipe the pre-armed retry slot for this id.
      await DROP_RETRY_OPEN_SIGNAL_FN(self, signal);
    }
    // Roll back the interval throttle consumed in GET_SIGNAL_FN so the strategy
    // reacts on the NEXT TICK (retry the same row / generate a fresh signal), not
    // on the next interval boundary (for "1h" that would be up to an hour of silence).
    self._lastSignalTimestamp = null;
    return null;
  }

  // Persist the pending signal only AFTER the broker confirmed the open —
  // persisting earlier left a phantom position on disk if the process crashed
  // between the write and the confirmation.
  await self.setPendingSignal(signal, signal.priceOpen);

  // The gate confirmed this id — the retry accounting for it is complete. Finish the
  // write-ahead wipe of the retry slot (kept on disk until this durable outcome; a
  // crash before this point replays the same id and reconciles on the exchange side).
  if (self._retryOpenSignal?.id === signal.id) {
    self._retryOpenSignal = null;
    self._retryOpenCount = 0;
    await PERSIST_STRATEGY_FN(self);
  }

  // Whipsaw protection: record the id only after a successful open so a
  // rejected open can retry the same deterministic id on the next tick
  // (the interval throttle is rolled back on rejection — see above).
  self._lastPendingId = signal.id;

  await CALL_RISK_ADD_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    signal,
    currentTime,
    self.params.execution.context.backtest
  );

  await CALL_SIGNAL_EVENT_FN(self, "opened", signal, signal.priceOpen, currentTime);

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
    signal: TO_PUBLIC_SIGNAL("pending", signal, signal.priceOpen),
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
  const syncCloseAllowed = await CALL_ORDER_SYNC_CLOSE_FN(
    currentTime,
    currentPrice,
    closeReason,
    signal,
    self
  );

  const closeVerdict = RESOLVE_CLOSE_GATE_FN(self, syncCloseAllowed, signal, closeReason);
  if (closeVerdict === "retry") {
    self.params.logger.info(`ClientStrategy signal ${closeReason} rejected by sync`, {
      symbol: self.params.execution.context.symbol,
      signalId: signal.id,
      closeReason,
      attempt: self._retryCloseCount,
    });
    return null;
  }
  // "allow" | "force" — proceed with the teardown ("force" = attempts exhausted or
  // terminal rejection; RESOLVE_CLOSE_GATE_FN already screamed via errorEmitter and
  // the adapter/operator reconciles the real exchange position off the close event).

  const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);

  self.params.logger.info(`ClientStrategy signal ${closeReason}`, {
    symbol: self.params.execution.context.symbol,
    signalId: signal.id,
    closeReason,
    priceClose: currentPrice,
    pnlPercentage: publicSignal.pnl.pnlPercentage,
  });

  await CALL_SIGNAL_EVENT_FN(self, "closed", signal, currentPrice, currentTime, closeReason);

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

  await self.setPendingSignal(null, currentPrice);

  const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: publicSignal,
    currentPrice: currentPrice,
    closeReason: closeReason,
    closeTimestamp: currentTime,
    pnl: publicSignal.pnl,
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

/**
 * Closes the pending signal with closeReason "closed" after the pending-order ping reported the
 * order is no longer open on the exchange (CALL_ORDER_CHECK_FN returned false / threw).
 *
 * Unlike CLOSE_PENDING_SIGNAL_FN this does NOT re-confirm via onOrderSync — the ping already
 * established the order is gone, so re-asking the broker would be redundant. Runs the same teardown
 * (close callback, partial/breakeven clear, risk remove, setPendingSignal(null)). Live-only path.
 */
const CLOSE_PENDING_SIGNAL_AS_CLOSED_FN = async (
  self: ClientStrategy,
  signal: ISignalRow,
  currentPrice: number
): Promise<IStrategyTickResultClosed> => {
  const currentTime = self.params.execution.context.when.getTime();

  const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);

  self.params.logger.info("ClientStrategy signal closed by pending-order ping (order no longer open on exchange)", {
    symbol: self.params.execution.context.symbol,
    signalId: signal.id,
    priceClose: currentPrice,
    pnlPercentage: publicSignal.pnl.pnlPercentage,
  });

  await CALL_SIGNAL_EVENT_FN(self, "closed", signal, currentPrice, currentTime, "closed");

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

  await self.setPendingSignal(null, currentPrice);

  const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: publicSignal,
    currentPrice: currentPrice,
    closeReason: "closed",
    closeTimestamp: currentTime,
    pnl: publicSignal.pnl,
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
  currentPrice: number,
  backtest: boolean
): Promise<IStrategyTickResultActive> => {
  let percentTp = 0;
  let percentSl = 0;

  const currentTime = self.params.execution.context.when.getTime();


  // Calculate percentage of path to TP/SL for partial fill/loss callbacks
  {
    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
    if (signal.position === "long") {
      // For long: calculate progress towards TP or SL
      const currentDistance = currentPrice - effectivePriceOpen;

      if (currentDistance > 0) {
        // Moving towards TP (use trailing TP if set)
        const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
        const tpDistance = effectiveTakeProfit - effectivePriceOpen;
        percentTp = GET_PROGRESS_PERCENT_FN(currentDistance, tpDistance);

        if (currentPrice > signal._peak.price) {
          const { pnl } = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
          signal._peak = { price: currentPrice, timestamp: currentTime, pnlCost: pnl.pnlCost, pnlPercentage: pnl.pnlPercentage, pnlEntries: pnl.pnlEntries, priceClose: pnl.priceClose, priceOpen: pnl.priceOpen};
          if (self.params.callbacks?.onWrite) {
            self.params.callbacks.onWrite(
              signal.symbol,
              signal,
              currentPrice,
              new Date(currentTime),
              backtest
            );
          }
          !backtest && await PersistSignalAdapter.writeSignalData(
            signal,
            self.params.execution.context.symbol,
            self.params.strategyName,
            self.params.exchangeName,
          );
          await self.params.onHighestProfit(
            TO_PUBLIC_SIGNAL("pending", signal, currentPrice),
            currentPrice,
            currentTime,
          )
        }

        await CALL_ACTIVE_PING_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentTime,
          self.params.execution.context.backtest,
          currentPrice
        );

        // Check if breakeven should be triggered
        await CALL_BREAKEVEN_CHECK_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          currentTime,
          self.params.execution.context.backtest
        );

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
        percentSl = GET_PROGRESS_PERCENT_FN(Math.abs(currentDistance), slDistance);
        if (currentPrice < signal._fall.price) {
          const { pnl } = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
          signal._fall = { price: currentPrice, timestamp: currentTime, pnlCost: pnl.pnlCost, pnlPercentage: pnl.pnlPercentage, pnlEntries: pnl.pnlEntries, priceClose: pnl.priceClose, priceOpen: pnl.priceOpen };
          if (self.params.callbacks?.onWrite) {
            self.params.callbacks.onWrite(
              signal.symbol,
              signal,
              currentPrice,
              new Date(currentTime),
              backtest
            );
          }
          !backtest && await PersistSignalAdapter.writeSignalData(
            signal,
            self.params.execution.context.symbol,
            self.params.strategyName,
            self.params.exchangeName,
          );
          await self.params.onMaxDrawdown(
            TO_PUBLIC_SIGNAL("pending", signal, currentPrice),
            currentPrice,
            currentTime,
          );
        }
        await CALL_ACTIVE_PING_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentTime,
          self.params.execution.context.backtest,
          currentPrice
        );
        await CALL_PARTIAL_LOSS_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentSl,
          currentTime,
          self.params.execution.context.backtest
        );
      } else {
        await CALL_ACTIVE_PING_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentTime,
          self.params.execution.context.backtest,
          currentPrice
        );
      }
    } else if (signal.position === "short") {
      // For short: calculate progress towards TP or SL
      const currentDistance = effectivePriceOpen - currentPrice;

      if (currentDistance > 0) {
        // Moving towards TP (use trailing TP if set)
        const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
        const tpDistance = effectivePriceOpen - effectiveTakeProfit;
        percentTp = GET_PROGRESS_PERCENT_FN(currentDistance, tpDistance);

        if (currentPrice < signal._peak.price) {
          const { pnl } = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
          signal._peak = { price: currentPrice, timestamp: currentTime, pnlCost: pnl.pnlCost, pnlPercentage: pnl.pnlPercentage, pnlEntries: pnl.pnlEntries, priceClose: pnl.priceClose, priceOpen: pnl.priceOpen };
          if (self.params.callbacks?.onWrite) {
            self.params.callbacks.onWrite(
              signal.symbol,
              signal,
              currentPrice,
              new Date(currentTime),
              backtest
            );
          }
          !backtest && await PersistSignalAdapter.writeSignalData(
            signal,
            self.params.execution.context.symbol,
            self.params.strategyName,
            self.params.exchangeName,
          );
          await self.params.onHighestProfit(
            TO_PUBLIC_SIGNAL("pending", signal, currentPrice),
            currentPrice,
            currentTime,
          )
        }

        await CALL_ACTIVE_PING_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentTime,
          self.params.execution.context.backtest,
          currentPrice
        );

        // Check if breakeven should be triggered
        await CALL_BREAKEVEN_CHECK_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          currentTime,
          self.params.execution.context.backtest
        );

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
        const slDistance = effectiveStopLoss - effectivePriceOpen;
        percentSl = GET_PROGRESS_PERCENT_FN(Math.abs(currentDistance), slDistance);
        if (currentPrice > signal._fall.price) {
          const { pnl } = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);
          signal._fall = { price: currentPrice, timestamp: currentTime, pnlCost: pnl.pnlCost, pnlPercentage: pnl.pnlPercentage, pnlEntries: pnl.pnlEntries, priceClose: pnl.priceClose, priceOpen: pnl.priceOpen };
          if (self.params.callbacks?.onWrite) {
            self.params.callbacks.onWrite(
              signal.symbol,
              signal,
              currentPrice,
              new Date(currentTime),
              backtest
            );
          }
          !backtest && await PersistSignalAdapter.writeSignalData(
            signal,
            self.params.execution.context.symbol,
            self.params.strategyName,
            self.params.exchangeName,
          );
          await self.params.onMaxDrawdown(
            TO_PUBLIC_SIGNAL("pending", signal, currentPrice),
            currentPrice,
            currentTime,
          );
        }
        await CALL_ACTIVE_PING_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentTime,
          self.params.execution.context.backtest,
          currentPrice
        );
        await CALL_PARTIAL_LOSS_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentPrice,
          percentSl,
          currentTime,
          self.params.execution.context.backtest
        );
      } else {
        await CALL_ACTIVE_PING_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          signal,
          currentTime,
          self.params.execution.context.backtest,
          currentPrice
        );
      }
    }
  }

  const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, currentPrice);

  const result: IStrategyTickResultActive = {
    action: "active",
    signal: publicSignal,
    currentPrice: currentPrice,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    percentTp,
    percentSl,
    pnl: publicSignal.pnl,
    backtest: self.params.execution.context.backtest,
    createdAt: currentTime,
    _backtestLastTimestamp: currentTime,
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

  await CALL_IDLE_PING_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    currentTime,
    self.params.execution.context.backtest,
    currentPrice
  );

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
  reason: StrategyCancelReason,
  cancelId?: string,
  cancelNote?: string
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

  // Release the slot reserved at scheduled-signal creation
  await CALL_RISK_REMOVE_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, averagePrice);

  await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, averagePrice, closeTimestamp, reason);

  if (reason === "user") {
    await CALL_COMMIT_FN(self, {
      action: "cancel-scheduled",
      symbol: self.params.execution.context.symbol,
      strategyName: self.params.strategyName,
      exchangeName: self.params.exchangeName,
      frameName: self.params.frameName,
      signalId: scheduled.id,
      backtest: true,
      cancelId,
      timestamp: closeTimestamp,
      totalEntries: scheduled._entry?.length ?? 1,
      totalPartials: scheduled._partial?.length ?? 0,
      originalPriceOpen: scheduled.priceOpen,
      pnl: publicSignal.pnl,
      maxDrawdown: publicSignal.maxDrawdown,
      peakProfit: publicSignal.peakProfit,
      signal: publicSignal,
      note: cancelNote ?? scheduled.note,
    });
  }

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
    signal: publicSignal,
    currentPrice: averagePrice,
    closeTimestamp: closeTimestamp,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    reason,
    cancelId,
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
    // Release the slot reserved at scheduled-signal creation
    await CALL_RISK_REMOVE_SIGNAL_FN(
      self,
      self.params.execution.context.symbol,
      activationTimestamp,
      self.params.execution.context.backtest
    );
    // The signal is dropped for good — emit the cancellation so subscribers
    // (commit + schedule event) see the drop instead of the signal silently
    // vanishing (ScheduleMarkdownService cancellation stats included).
    // Emitted synchronously in this branch on purpose: setScheduledSignal(null)
    // above wipes a _cancelledSignal deferred by a concurrent stopStrategy, so
    // this is the single emission point in that race (the wipe acts as dedup).
    {
      const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, scheduled.priceOpen);
      await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, scheduled.priceOpen, activationTimestamp, "user");
      await CALL_COMMIT_FN(self, {
        action: "cancel-scheduled",
        symbol: self.params.execution.context.symbol,
        strategyName: self.params.strategyName,
        exchangeName: self.params.exchangeName,
        frameName: self.params.frameName,
        signalId: scheduled.id,
        backtest: self.params.execution.context.backtest,
        timestamp: activationTimestamp,
        totalEntries: scheduled._entry?.length ?? 1,
        totalPartials: scheduled._partial?.length ?? 0,
        originalPriceOpen: scheduled.priceOpen,
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
        note: scheduled.note,
      });
    }
    return false;
  }

  // В BACKTEST режиме activationTimestamp - это candle.timestamp свечи,
  // на которой цена достигла priceOpen (см. PROCESS_SCHEDULED_SIGNAL_CANDLES_FN).
  // minuteEstimatedTime отсчитывается от этого момента активации.
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
    // Release the slot reserved at scheduled-signal creation (the activation
    // check above returned false, so no new reservation replaced it)
    await CALL_RISK_REMOVE_SIGNAL_FN(
      self,
      self.params.execution.context.symbol,
      activationTime,
      self.params.execution.context.backtest
    );
    // The signal is dropped for good — emit the cancellation so subscribers
    // (commit + schedule event) see the drop instead of the signal silently vanishing
    {
      const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, scheduled.priceOpen);
      await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, scheduled.priceOpen, activationTime, "user");
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
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
        note: scheduled.note,
      });
    }
    return false;
  }

  // КРИТИЧЕСКИ ВАЖНО: обновляем pendingAt при активации в backtest
  const activatedSignal: ISignalRow = {
    ...scheduled,
    pendingAt: activationTime,
    _isScheduled: false,
    _peak: { price: scheduled.priceOpen, timestamp: activationTime, pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceClose: 0, priceOpen: 0 },
    _fall: { price: scheduled.priceOpen, timestamp: activationTime, pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceClose: 0, priceOpen: 0 },
  };
  {
    const { pnlPercentage, pnlCost, pnlEntries, priceClose, priceOpen } = toProfitLossDto(activatedSignal, activatedSignal.priceOpen);
    activatedSignal._fall = { price: activatedSignal.priceOpen, timestamp: activationTime, pnlPercentage, pnlCost, pnlEntries, priceClose, priceOpen };
  }

  // Sync open: if external system rejects — cancel scheduled signal instead of opening
  const syncOpenAllowed = await CALL_ORDER_SYNC_OPEN_FN(
    activationTime,
    activatedSignal.priceOpen,
    activatedSignal,
    self
  );

  if (syncOpenAllowed.reason !== "confirmed") {
    self.params.logger.info("ClientStrategy backtest scheduled signal activation rejected by sync", {
      symbol: self.params.execution.context.symbol,
      signalId: scheduled.id,
    });
    await self.setScheduledSignal(null);
    // Release the slot reserved by checkSignalAndReserve above
    await CALL_RISK_REMOVE_SIGNAL_FN(
      self,
      self.params.execution.context.symbol,
      activationTime,
      self.params.execution.context.backtest
    );
    const publicSignal = TO_PUBLIC_SIGNAL("scheduled", scheduled, scheduled.priceOpen);
    // Notify the broker channel too — commit alone bypasses Broker.commitScheduleCancelled,
    // leaving the real resting order alive on the exchange
    await CALL_SCHEDULE_EVENT_FN(self, "cancelled", scheduled, scheduled.priceOpen, activationTime, "user");
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
      pnl: publicSignal.pnl,
      maxDrawdown: publicSignal.maxDrawdown,
      peakProfit: publicSignal.peakProfit,
      signal: publicSignal,
      note: scheduled.note,
    });
    return false;
  }

  // Write-ahead order: persist the activated pending FIRST, wipe the scheduled
  // snapshot second — a crash between the writes leaves both on disk and
  // waitForInit reconciles by id (the pending supersedes the same-id scheduled).
  // The reverse order lost a broker-confirmed open: neither snapshot survived,
  // leaving an orphaned live position on the exchange.
  await self.setPendingSignal(activatedSignal, activatedSignal.priceOpen);

  await self.setScheduledSignal(null);

  // Whipsaw protection: record the id only after a successful open
  self._lastPendingId = activatedSignal.id;

  await CALL_RISK_ADD_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    activatedSignal,
    activationTime,
    self.params.execution.context.backtest
  );

  await CALL_SIGNAL_EVENT_FN(self, "opened", activatedSignal, activatedSignal.priceOpen, activationTime);

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
  const syncCloseAllowed = await CALL_ORDER_SYNC_CLOSE_FN(
    closeTimestamp,
    averagePrice,
    closeReason,
    signal,
    self
  );

  const closeVerdict = RESOLVE_CLOSE_GATE_FN(self, syncCloseAllowed, signal, closeReason);
  if (closeVerdict === "retry") {
    self.params.logger.info(`ClientStrategy backtest ${closeReason} rejected by sync`, {
      symbol: self.params.execution.context.symbol,
      signalId: signal.id,
      closeReason,
      attempt: self._retryCloseCount,
    });
    return null;
  }
  // "allow" | "force" — proceed with the teardown (see RESOLVE_CLOSE_GATE_FN)

  const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, averagePrice);

  self.params.logger.debug(`ClientStrategy backtest ${closeReason}`, {
    symbol: self.params.execution.context.symbol,
    signalId: signal.id,
    reason: closeReason,
    priceClose: averagePrice,
    closeTimestamp,
    pnlPercentage: publicSignal.pnl.pnlPercentage,
  });

  if (closeReason === "stop_loss") {
    self.params.logger.warn(
      `ClientStrategy backtest: Signal closed with loss (stop_loss), PNL: ${publicSignal.pnl.pnlPercentage.toFixed(
        2
      )}%`
    );
  }

  if (closeReason === "time_expired" && publicSignal.pnl.pnlPercentage < 0) {
    self.params.logger.warn(
      `ClientStrategy backtest: Signal closed with loss (time_expired), PNL: ${publicSignal.pnl.pnlPercentage.toFixed(
        2
      )}%`
    );
  }

  await CALL_SIGNAL_EVENT_FN(self, "closed", signal, averagePrice, closeTimestamp, closeReason);

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

  await self.setPendingSignal(null, averagePrice);

  const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: publicSignal,
    currentPrice: averagePrice,
    closeReason: closeReason,
    closeTimestamp: closeTimestamp,
    pnl: publicSignal.pnl,
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

const CLOSE_USER_PENDING_SIGNAL_IN_BACKTEST_FN = async (
  self: ClientStrategy,
  closedSignal: ISignalCloseRow,
  averagePrice: number,
  closeTimestamp: number
): Promise<IStrategyTickResultClosed | null> => {
  const syncCloseAllowed = await CALL_ORDER_SYNC_CLOSE_FN(
    closeTimestamp,
    averagePrice,
    "closed",
    closedSignal,
    self
  );

  const closeVerdict = RESOLVE_CLOSE_GATE_FN(self, syncCloseAllowed, closedSignal, "closed");
  if (closeVerdict === "retry") {
    // Sync close rejected (e.g. broker rejected the order) — keep _closedSignal intact
    // and return null so the candle loop re-attempts on the next candle. Mirrors live
    // tick, which keeps _closedSignal and returns idle on a rejected user close,
    // re-trying on the following tick. Bounded by CC_ORDER_CLOSE_RETRY_ATTEMPTS:
    // exhaustion (or a terminal rejection) falls through and force-closes.
    self.params.logger.info("ClientStrategy backtest: user-closed signal rejected by sync, will retry on next candle", {
      symbol: self.params.execution.context.symbol,
      signalId: closedSignal.id,
      attempt: self._retryCloseCount,
    });
    return null;
  }
  // "allow" | "force" — proceed with the teardown (see RESOLVE_CLOSE_GATE_FN)

  self._closedSignal = null;

  const publicSignal = TO_PUBLIC_SIGNAL("pending", closedSignal, averagePrice);

  await CALL_COMMIT_FN(self, {
    action: "close-pending",
    symbol: self.params.execution.context.symbol,
    strategyName: self.params.strategyName,
    exchangeName: self.params.exchangeName,
    frameName: self.params.frameName,
    signalId: closedSignal.id,
    backtest: true,
    closeId: closedSignal.closeId,
    timestamp: closeTimestamp,
    totalEntries: closedSignal._entry?.length ?? 1,
    totalPartials: closedSignal._partial?.length ?? 0,
    originalPriceOpen: closedSignal.priceOpen,
    pnl: publicSignal.pnl,
    maxDrawdown: publicSignal.maxDrawdown,
    peakProfit: publicSignal.peakProfit,
    signal: publicSignal,
    note: closedSignal.closeNote ?? closedSignal.note,
  });

  await CALL_SIGNAL_EVENT_FN(self, "closed", closedSignal, averagePrice, closeTimestamp, "closed");

  await CALL_CLOSE_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    closedSignal,
    averagePrice,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  await CALL_PARTIAL_CLEAR_FN(
    self,
    self.params.execution.context.symbol,
    closedSignal,
    averagePrice,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  await CALL_BREAKEVEN_CLEAR_FN(
    self,
    self.params.execution.context.symbol,
    closedSignal,
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

  const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: publicSignal,
    currentPrice: averagePrice,
    closeReason: "closed",
    closeTimestamp,
    pnl: publicSignal.pnl,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    closeId: closedSignal.closeId,
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

/**
 * Closes a deferred broker-confirmed TP/SL fill (createTakeProfit / createStopLoss).
 *
 * The exchange and the strategy are parallel states: ClientStrategy evaluates TP/SL against VWAP,
 * but the real order may fill on candle high/low. When the broker confirms such a fill out of
 * context, the pending signal is snapshotted into _takeProfitSignal / _stopLossSignal and the next
 * tick()/backtest() drains it here, closing with the matching closeReason at the effective TP/SL
 * level (trailing override if set) — bypassing the VWAP completion check.
 *
 * Shared by live tick and backtest: the caller passes the close timestamp explicitly (execution
 * context when in live, candle timestamp in backtest). Mirrors CLOSE_USER_PENDING_SIGNAL_IN_BACKTEST_FN
 * (commit action "close-pending", carrying closeId/note) but with closeReason take_profit / stop_loss.
 *
 * Like the deferred close, the fill snapshot is already established by the broker, so it does NOT
 * re-confirm via onOrderSync. _takeProfitSignal / _stopLossSignal is cleared and re-persisted by
 * the caller after draining.
 */
const CLOSE_PENDING_SIGNAL_AS_FILL_FN = async (
  self: ClientStrategy,
  filledSignal: ISignalCloseRow,
  closeReason: "take_profit" | "stop_loss",
  closeTimestamp: number
): Promise<IStrategyTickResultClosed> => {
  const closePrice = closeReason === "take_profit"
    ? (filledSignal._trailingPriceTakeProfit ?? filledSignal.priceTakeProfit)
    : (filledSignal._trailingPriceStopLoss ?? filledSignal.priceStopLoss);

  const publicSignal = TO_PUBLIC_SIGNAL("pending", filledSignal, closePrice);

  self.params.logger.info(`ClientStrategy signal ${closeReason} by broker-confirmed fill (createTakeProfit/createStopLoss)`, {
    symbol: self.params.execution.context.symbol,
    signalId: filledSignal.id,
    closeReason,
    priceClose: closePrice,
    pnlPercentage: publicSignal.pnl.pnlPercentage,
  });

  await CALL_COMMIT_FN(self, {
    action: "close-pending",
    symbol: self.params.execution.context.symbol,
    strategyName: self.params.strategyName,
    exchangeName: self.params.exchangeName,
    frameName: self.params.frameName,
    signalId: filledSignal.id,
    backtest: self.params.execution.context.backtest,
    closeId: filledSignal.closeId,
    timestamp: closeTimestamp,
    totalEntries: filledSignal._entry?.length ?? 1,
    totalPartials: filledSignal._partial?.length ?? 0,
    originalPriceOpen: filledSignal.priceOpen,
    pnl: publicSignal.pnl,
    maxDrawdown: publicSignal.maxDrawdown,
    peakProfit: publicSignal.peakProfit,
    signal: publicSignal,
    note: filledSignal.closeNote ?? filledSignal.note,
  });

  await CALL_SIGNAL_EVENT_FN(self, "closed", filledSignal, closePrice, closeTimestamp, closeReason);

  await CALL_CLOSE_CALLBACKS_FN(
    self,
    self.params.execution.context.symbol,
    filledSignal,
    closePrice,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  // КРИТИЧНО: Очищаем состояние ClientPartial при закрытии позиции
  await CALL_PARTIAL_CLEAR_FN(
    self,
    self.params.execution.context.symbol,
    filledSignal,
    closePrice,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  // КРИТИЧНО: Очищаем состояние ClientBreakeven при закрытии позиции
  await CALL_BREAKEVEN_CLEAR_FN(
    self,
    self.params.execution.context.symbol,
    filledSignal,
    closePrice,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  await CALL_RISK_REMOVE_SIGNAL_FN(
    self,
    self.params.execution.context.symbol,
    closeTimestamp,
    self.params.execution.context.backtest
  );

  const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: publicSignal,
    currentPrice: closePrice,
    closeReason,
    closeTimestamp,
    pnl: publicSignal.pnl,
    strategyName: self.params.method.context.strategyName,
    exchangeName: self.params.method.context.exchangeName,
    frameName: self.params.method.context.frameName,
    symbol: self.params.execution.context.symbol,
    backtest: self.params.execution.context.backtest,
    closeId: filledSignal.closeId,
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

type ScheduledProcessResult =
  | { outcome: "activated"; activationIndex: number }
  | { outcome: "cancelled"; result: IStrategyTickResultCancelled }
  | { outcome: "pending" };

const PROCESS_SCHEDULED_SIGNAL_CANDLES_FN = async (
  self: ClientStrategy,
  scheduled: IScheduledSignalRow,
  candles: ICandleData[],
  frameEndTime: number
): Promise<ScheduledProcessResult> => {
  if (candles.length === 0) {
    throw new Error(
      `ClientStrategy backtest: empty candles array for scheduled signal processing (signalId=${scheduled.id}). ` +
      `Provide at least ${GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT} candles (VWAP buffer included).`
    );
  }
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

    // Если timestamp свечи вышел за frameEndTime — отменяем scheduled сигнал
    if (candle.timestamp > frameEndTime) {
      const result = await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
        self,
        scheduled,
        averagePrice,
        candle.timestamp,
        "timeout"
      );
      return { outcome: "cancelled", result };
    }

    // КРИТИЧНО: Проверяем был ли сигнал отменен пользователем через cancel()
    if (self._cancelledSignal) {
      // Сигнал был отменен через cancel() в onSchedulePing
      const cancelId = self._cancelledSignal.cancelId;
      const cancelNote = self._cancelledSignal.cancelNote;
      const result = await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
        self,
        scheduled,
        averagePrice,
        candle.timestamp,
        "user",
        cancelId,
        cancelNote
      );
      return { outcome: "cancelled", result };
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
        // Release the slot reserved at scheduled-signal creation
        await CALL_RISK_REMOVE_SIGNAL_FN(
          self,
          self.params.execution.context.symbol,
          candle.timestamp,
          self.params.execution.context.backtest
        );
        // The signal is dropped for good — emit the cancellation so subscribers
        // (commit + schedule event) see it instead of the signal silently vanishing
        {
          const publicSignal = TO_PUBLIC_SIGNAL("scheduled", activatedSignal, averagePrice);
          await CALL_SCHEDULE_EVENT_FN(self, "cancelled", activatedSignal, averagePrice, candle.timestamp, "user");
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
            pnl: publicSignal.pnl,
            maxDrawdown: publicSignal.maxDrawdown,
            peakProfit: publicSignal.peakProfit,
            signal: publicSignal,
            note: activatedSignal.activateNote ?? activatedSignal.note,
          });
        }
        // The scheduled signal is gone for good — return a cancelled outcome so
        // BACKTEST_FN does not expect a pending signal (fatal "no pending signal
        // after scheduled activation" used to break the whole backtest here)
        {
          const result: IStrategyTickResultCancelled = {
            action: "cancelled",
            signal: TO_PUBLIC_SIGNAL("scheduled", activatedSignal, averagePrice),
            currentPrice: averagePrice,
            closeTimestamp: candle.timestamp,
            strategyName: self.params.method.context.strategyName,
            exchangeName: self.params.method.context.exchangeName,
            frameName: self.params.method.context.frameName,
            symbol: self.params.execution.context.symbol,
            backtest: self.params.execution.context.backtest,
            reason: "user",
            createdAt: candle.timestamp,
          };
          await CALL_TICK_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            result,
            candle.timestamp,
            self.params.execution.context.backtest
          );
          return { outcome: "cancelled", result };
        }
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
        // Release the slot reserved at scheduled-signal creation (the activation
        // check above returned false, so no new reservation replaced it)
        await CALL_RISK_REMOVE_SIGNAL_FN(
          self,
          self.params.execution.context.symbol,
          candle.timestamp,
          self.params.execution.context.backtest
        );
        // The signal is dropped for good — emit the cancellation so subscribers
        // (commit + schedule event) see it instead of the signal silently vanishing
        {
          const publicSignal = TO_PUBLIC_SIGNAL("scheduled", activatedSignal, averagePrice);
          await CALL_SCHEDULE_EVENT_FN(self, "cancelled", activatedSignal, averagePrice, candle.timestamp, "user");
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
            pnl: publicSignal.pnl,
            maxDrawdown: publicSignal.maxDrawdown,
            peakProfit: publicSignal.peakProfit,
            signal: publicSignal,
            note: activatedSignal.activateNote ?? activatedSignal.note,
          });
        }
        // The scheduled signal is gone for good — return a cancelled outcome so
        // BACKTEST_FN does not expect a pending signal (fatal "no pending signal
        // after scheduled activation" used to break the whole backtest here)
        {
          const result: IStrategyTickResultCancelled = {
            action: "cancelled",
            signal: TO_PUBLIC_SIGNAL("scheduled", activatedSignal, averagePrice),
            currentPrice: averagePrice,
            closeTimestamp: candle.timestamp,
            strategyName: self.params.method.context.strategyName,
            exchangeName: self.params.method.context.exchangeName,
            frameName: self.params.method.context.frameName,
            symbol: self.params.execution.context.symbol,
            backtest: self.params.execution.context.backtest,
            reason: "user",
            createdAt: candle.timestamp,
          };
          await CALL_TICK_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            result,
            candle.timestamp,
            self.params.execution.context.backtest
          );
          return { outcome: "cancelled", result };
        }
      }

      const pendingSignal: ISignalRow = {
        ...activatedSignal,
        pendingAt: candle.timestamp,
        _isScheduled: false,
        _peak: { price: activatedSignal.priceOpen, timestamp: candle.timestamp, pnlPercentage: 0, pnlCost: 0, priceClose: 0, priceOpen: 0, pnlEntries: 0 },
        _fall: { price: activatedSignal.priceOpen, timestamp: candle.timestamp, pnlPercentage: 0, pnlCost: 0, priceClose: 0, priceOpen: 0, pnlEntries: 0 },
      };
      {
        const { pnlPercentage, pnlCost, pnlEntries, priceClose, priceOpen } = toProfitLossDto(pendingSignal, pendingSignal.priceOpen);
        pendingSignal._fall = { price: pendingSignal.priceOpen, timestamp: candle.timestamp, pnlPercentage, pnlCost, priceClose, priceOpen, pnlEntries };
      }

      // Sync open: if external system rejects — cancel scheduled signal instead of opening
      const syncOpenAllowed = await CALL_ORDER_SYNC_OPEN_FN(
        candle.timestamp,
        pendingSignal.priceOpen,
        pendingSignal,
        self
      );

      if (syncOpenAllowed.reason !== "confirmed") {
        self.params.logger.info("ClientStrategy backtest user-activated signal rejected by sync", {
          symbol: self.params.execution.context.symbol,
          signalId: activatedSignal.id,
        });
        await self.setScheduledSignal(null);
        // Release the slot reserved by checkSignalAndReserve above
        await CALL_RISK_REMOVE_SIGNAL_FN(
          self,
          self.params.execution.context.symbol,
          candle.timestamp,
          self.params.execution.context.backtest
        );
        const publicSignal = TO_PUBLIC_SIGNAL("scheduled", activatedSignal, averagePrice);
        // Notify the broker channel too — commit alone bypasses Broker.commitScheduleCancelled,
        // leaving the real resting order alive on the exchange
        await CALL_SCHEDULE_EVENT_FN(self, "cancelled", activatedSignal, averagePrice, candle.timestamp, "user");
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
          pnl: publicSignal.pnl,
          maxDrawdown: publicSignal.maxDrawdown,
          peakProfit: publicSignal.peakProfit,
          signal: publicSignal,
          note: activatedSignal.activateNote ?? activatedSignal.note,
        });
        // The scheduled signal is gone for good — return a cancelled outcome so
        // BACKTEST_FN does not expect a pending signal (fatal "no pending signal
        // after scheduled activation" used to break the whole backtest here)
        {
          const result: IStrategyTickResultCancelled = {
            action: "cancelled",
            signal: publicSignal,
            currentPrice: averagePrice,
            closeTimestamp: candle.timestamp,
            strategyName: self.params.method.context.strategyName,
            exchangeName: self.params.method.context.exchangeName,
            frameName: self.params.method.context.frameName,
            symbol: self.params.execution.context.symbol,
            backtest: self.params.execution.context.backtest,
            reason: "user",
            createdAt: candle.timestamp,
          };
          await CALL_TICK_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            result,
            candle.timestamp,
            self.params.execution.context.backtest
          );
          return { outcome: "cancelled", result };
        }
      }

      // Write-ahead order: pending first, scheduled wipe second (см. комментарий
      // в ACTIVATE_SCHEDULED_SIGNAL_FN — крэш между записями реконсилируется
      // в waitForInit по совпадению id)
      await self.setPendingSignal(pendingSignal, averagePrice);

      await self.setScheduledSignal(null);

      // Whipsaw protection: record the id only after a successful open
      self._lastPendingId = pendingSignal.id;

      await CALL_RISK_ADD_SIGNAL_FN(
        self,
        self.params.execution.context.symbol,
        pendingSignal,
        candle.timestamp,
        self.params.execution.context.backtest
      );

      // Emit commit AFTER successful risk check
      const publicSignalForCommit = TO_PUBLIC_SIGNAL("pending", pendingSignal, averagePrice);
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
        pnl: publicSignalForCommit.pnl,
        maxDrawdown: publicSignalForCommit.maxDrawdown,
        peakProfit: publicSignalForCommit.peakProfit,
        signal: publicSignalForCommit,
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
        note: activatedSignal.activateNote ?? publicSignalForCommit.note,
      });

      await CALL_SIGNAL_EVENT_FN(self, "opened", pendingSignal, pendingSignal.priceOpen, candle.timestamp);

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

      return { outcome: "activated", activationIndex: i };
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
      return { outcome: "cancelled", result };
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
      return { outcome: "cancelled", result };
    }

    if (shouldActivate) {
      const activated = await ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN(self, scheduled, candle.timestamp);
      if (!activated) {
        // Activation was rejected (stopped/risk/sync) — ACTIVATE_... already
        // released the reservation and emitted the cancel commit + schedule
        // event. Return a cancelled outcome so BACKTEST_FN does not expect a
        // pending signal (fatal "no pending signal after scheduled activation"
        // used to break the whole backtest here).
        const result: IStrategyTickResultCancelled = {
          action: "cancelled",
          signal: TO_PUBLIC_SIGNAL("scheduled", scheduled, averagePrice),
          currentPrice: averagePrice,
          closeTimestamp: candle.timestamp,
          strategyName: self.params.method.context.strategyName,
          exchangeName: self.params.method.context.exchangeName,
          frameName: self.params.method.context.frameName,
          symbol: self.params.execution.context.symbol,
          backtest: self.params.execution.context.backtest,
          reason: "user",
          createdAt: candle.timestamp,
        };
        await CALL_TICK_CALLBACKS_FN(
          self,
          self.params.execution.context.symbol,
          result,
          candle.timestamp,
          self.params.execution.context.backtest
        );
        return { outcome: "cancelled", result };
      }
      return { outcome: "activated", activationIndex: i };
    }

    await CALL_SCHEDULE_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, scheduled, candle.timestamp, true, averagePrice);

    // Process queued commit events with candle timestamp
    await PROCESS_COMMIT_QUEUE_FN(self, averagePrice, candle.timestamp);
  }

  // Deferred-команды дренятся в НАЧАЛЕ следующей свечи — отмена, поданная из
  // onSchedulePing на ПОСЛЕДНЕЙ свече цикла, оставалась незадренированной:
  // backtest() пропускал scheduled-ветку (сигнал уже потреблён) и падал
  // фаталом «no pending signal after scheduled activation». Дренируем здесь
  // с меткой последней свечи.
  if (self._cancelledSignal) {
    const lastCandles = candles.slice(-candlesCount);
    const averagePrice = GET_AVG_PRICE_FN(lastCandles);
    const cancelId = self._cancelledSignal.cancelId;
    const cancelNote = self._cancelledSignal.cancelNote;
    const result = await CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN(
      self,
      scheduled,
      averagePrice,
      candles[candles.length - 1].timestamp,
      "user",
      cancelId,
      cancelNote
    );
    return { outcome: "cancelled", result };
  }

  return { outcome: "pending" };
};

const PROCESS_PENDING_SIGNAL_CANDLES_FN = async (
  self: ClientStrategy,
  signal: ISignalRow,
  candles: ICandleData[],
  frameEndTime: number
): Promise<IStrategyTickResultClosed | IStrategyTickResultActive> => {
  if (candles.length === 0) {
    throw new Error(
      `ClientStrategy backtest: empty candles array for pending signal processing (signalId=${signal.id}). ` +
      `Provide at least ${GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT} candles (VWAP buffer included).`
    );
  }
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

    // Если timestamp свечи вышел за frameEndTime — закрываем pending сигнал по time_expired
    if (currentCandleTimestamp > frameEndTime) {
      const result = await CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN(
        self,
        signal,
        averagePrice,
        "time_expired",
        currentCandleTimestamp
      );
      if (!result) {
        throw new Error(
          `ClientStrategy backtest: frameEndTime time_expired close rejected by sync (signalId=${signal.id}).`
        );
      }
      return result;
    }

    // КРИТИЧНО: Проверяем был ли сигнал закрыт пользователем через closePending()
    if (self._closedSignal) {
      const userCloseResult = await CLOSE_USER_PENDING_SIGNAL_IN_BACKTEST_FN(self, self._closedSignal, averagePrice, currentCandleTimestamp);
      // Sync close accepted — position closed, return. If rejected, _closedSignal is
      // kept and we skip this candle: live tick returns idle on a rejected user close
      // (it does NOT fall into the TP/SL or active-monitoring path), so the candle is
      // skipped here and the close is re-attempted on the next candle.
      if (userCloseResult) {
        return userCloseResult;
      }
      continue;
    }

    // КРИТИЧНО: Проверяем broker-confirmed TP fill через createTakeProfit() (напр. из onActivePing).
    // Закрываем по эффективному уровню TP, минуя VWAP-проверку. Sync не пере-подтверждается.
    if (self._takeProfitSignal) {
      const filledSignal = self._takeProfitSignal;
      self._takeProfitSignal = null;
      return await CLOSE_PENDING_SIGNAL_AS_FILL_FN(self, filledSignal, "take_profit", currentCandleTimestamp);
    }

    // КРИТИЧНО: Проверяем broker-confirmed SL fill через createStopLoss() (напр. из onActivePing).
    // Закрываем по эффективному уровню SL, минуя VWAP-проверку. Sync не пере-подтверждается.
    if (self._stopLossSignal) {
      const filledSignal = self._stopLossSignal;
      self._stopLossSignal = null;
      return await CLOSE_PENDING_SIGNAL_AS_FILL_FN(self, filledSignal, "stop_loss", currentCandleTimestamp);
    }

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

      const closeResult = await CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN(
        self,
        signal,
        closePrice,
        closeReason!,
        currentCandleTimestamp
      );

      // Sync close accepted — position closed, return.
      if (closeResult) {
        return closeResult;
      }

      // Sync close rejected (e.g. broker rejected the order) — _pendingSignal is left
      // intact (not cleared on rejection). Do NOT return/continue: fall through to the
      // active-monitoring block below so this candle is processed exactly like live
      // tick, which runs RETURN_PENDING_SIGNAL_ACTIVE_FN when CLOSE_PENDING_SIGNAL_FN
      // returns null (updates _peak/_fall, fires active ping / breakeven / partial
      // callbacks, drains the commit queue). The close is re-attempted on the next
      // candle; for time_expired this eventually reaches the loop-exhausted close
      // (which throws if still rejected).
    }

    // Call onPartialProfit/onPartialLoss callbacks during backtest candle processing
    // Calculate percentage of path to TP/SL
    {
      const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
      if (signal.position === "long") {
        // For long: calculate progress towards TP or SL
        const currentDistance = averagePrice - effectivePriceOpen;

        if (currentDistance > 0) {
          // Moving towards TP (use trailing TP if set)
          const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
          const tpDistance = effectiveTakeProfit - effectivePriceOpen;
          const progressPercent = GET_PROGRESS_PERCENT_FN(currentDistance, tpDistance);

          if (averagePrice > signal._peak.price) {
            const { pnl } = TO_PUBLIC_SIGNAL("pending", signal, averagePrice);
            signal._peak = { price: averagePrice, timestamp: currentCandleTimestamp, pnlCost: pnl.pnlCost, pnlPercentage: pnl.pnlPercentage, pnlEntries: pnl.pnlEntries, priceOpen: pnl.priceOpen, priceClose: pnl.priceClose };
            if (self.params.callbacks?.onWrite) {
              self.params.callbacks.onWrite(
                signal.symbol,
                signal,
                averagePrice,
                new Date(currentCandleTimestamp),
                true
              );
            }
            await self.params.onHighestProfit(
              TO_PUBLIC_SIGNAL("pending", signal, averagePrice),
              averagePrice,
              currentCandleTimestamp
            );
          }

          await CALL_ACTIVE_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, signal, currentCandleTimestamp, true, averagePrice);

          await CALL_BREAKEVEN_CHECK_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );

          await CALL_PARTIAL_PROFIT_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            progressPercent,
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
        } else if (currentDistance < 0) {
          // Moving towards SL (use trailing SL if set)
          const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;
          const slDistance = effectivePriceOpen - effectiveStopLoss;
          const progressPercent = GET_PROGRESS_PERCENT_FN(Math.abs(currentDistance), slDistance);
          if (averagePrice < signal._fall.price) {
            const { pnl } = TO_PUBLIC_SIGNAL("pending", signal, averagePrice);
            signal._fall = { price: averagePrice, timestamp: currentCandleTimestamp, pnlCost: pnl.pnlCost, pnlPercentage: pnl.pnlPercentage, pnlEntries: pnl.pnlEntries, priceOpen: pnl.priceOpen, priceClose: pnl.priceClose };
            if (self.params.callbacks?.onWrite) {
              self.params.callbacks.onWrite(
                signal.symbol,
                signal,
                averagePrice,
                new Date(currentCandleTimestamp),
                true
              );
            }
            await self.params.onMaxDrawdown(
              TO_PUBLIC_SIGNAL("pending", signal, averagePrice),
              averagePrice,
              currentCandleTimestamp
            );
          }
          await CALL_ACTIVE_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, signal, currentCandleTimestamp, true, averagePrice);
          await CALL_PARTIAL_LOSS_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            progressPercent,
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
        } else {
          await CALL_ACTIVE_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, signal, currentCandleTimestamp, true, averagePrice);
        }
      } else if (signal.position === "short") {
        // For short: calculate progress towards TP or SL
        const currentDistance = effectivePriceOpen - averagePrice;

        if (currentDistance > 0) {
          // Moving towards TP (use trailing TP if set)
          const effectiveTakeProfit = signal._trailingPriceTakeProfit ?? signal.priceTakeProfit;
          const tpDistance = effectivePriceOpen - effectiveTakeProfit;
          const progressPercent = GET_PROGRESS_PERCENT_FN(currentDistance, tpDistance);

          if (averagePrice < signal._peak.price) {
            const { pnl } = TO_PUBLIC_SIGNAL("pending", signal, averagePrice);
            signal._peak = { price: averagePrice, timestamp: currentCandleTimestamp, pnlCost: pnl.pnlCost, pnlPercentage: pnl.pnlPercentage, pnlEntries: pnl.pnlEntries, priceOpen: pnl.priceOpen, priceClose: pnl.priceClose };
            if (self.params.callbacks?.onWrite) {
              self.params.callbacks.onWrite(
                signal.symbol,
                signal,
                averagePrice,
                new Date(currentCandleTimestamp),
                true
              );
            }
            await self.params.onHighestProfit(
              TO_PUBLIC_SIGNAL("pending", signal, averagePrice),
              averagePrice,
              currentCandleTimestamp
            );
          }

          await CALL_ACTIVE_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, signal, currentCandleTimestamp, true, averagePrice);

          await CALL_BREAKEVEN_CHECK_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );

          await CALL_PARTIAL_PROFIT_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            progressPercent,
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
        } else if (currentDistance < 0) {
          // Moving towards SL (use trailing SL if set)
          const effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss;
          const slDistance = effectiveStopLoss - effectivePriceOpen;
          const progressPercent = GET_PROGRESS_PERCENT_FN(Math.abs(currentDistance), slDistance);
          if (averagePrice > signal._fall.price) {
            const { pnl } = TO_PUBLIC_SIGNAL("pending", signal, averagePrice);
            signal._fall = { price: averagePrice, timestamp: currentCandleTimestamp, pnlCost: pnl.pnlCost, pnlPercentage: pnl.pnlPercentage, pnlEntries: pnl.pnlEntries, priceOpen: pnl.priceOpen, priceClose: pnl.priceClose };
            if (self.params.callbacks?.onWrite) {
              self.params.callbacks.onWrite(
                signal.symbol,
                signal,
                averagePrice,
                new Date(currentCandleTimestamp),
                true
              );
            }
            await self.params.onMaxDrawdown(
              TO_PUBLIC_SIGNAL("pending", signal, averagePrice),
              averagePrice,
              currentCandleTimestamp
            );
          }
          await CALL_ACTIVE_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, signal, currentCandleTimestamp, true, averagePrice);
          await CALL_PARTIAL_LOSS_CALLBACKS_FN(
            self,
            self.params.execution.context.symbol,
            signal,
            averagePrice,
            progressPercent,
            currentCandleTimestamp,
            self.params.execution.context.backtest
          );
        } else {
          await CALL_ACTIVE_PING_CALLBACKS_FN(self, self.params.execution.context.symbol, signal, currentCandleTimestamp, true, averagePrice);
        }
      }
    }

    // Process queued commit events with candle timestamp
    await PROCESS_COMMIT_QUEUE_FN(self, averagePrice, currentCandleTimestamp);
  }

  // Loop exhausted without closing — check if we have enough data
  const lastCandles = candles.slice(-GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT);
  const lastPrice = GET_AVG_PRICE_FN(lastCandles);
  const closeTimestamp = lastCandles[lastCandles.length - 1].timestamp;

  if (signal.minuteEstimatedTime === Infinity) {
    const publicSignal = TO_PUBLIC_SIGNAL("pending", signal, lastPrice);
    const result: IStrategyTickResultActive = {
      action: "active",
      signal: publicSignal,
      currentPrice: lastPrice,
      strategyName: self.params.method.context.strategyName,
      exchangeName: self.params.method.context.exchangeName,
      frameName: self.params.method.context.frameName,
      symbol: self.params.execution.context.symbol,
      percentTp: 0,
      percentSl: 0,
      pnl: publicSignal.pnl,
      backtest: self.params.execution.context.backtest,
      createdAt: closeTimestamp,
      _backtestLastTimestamp: closeTimestamp,
    };
    return result;
  }

  const signalTime = signal.pendingAt;
  const maxTimeToWait = signal.minuteEstimatedTime * 60 * 1000;
  const elapsedTime = closeTimestamp - signalTime;

  if (elapsedTime < maxTimeToWait) {
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

  const timeExpiredResult = await CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN(
    self,
    signal,
    lastPrice,
    "time_expired",
    closeTimestamp
  );

  if (!timeExpiredResult) {
    throw new Error(
      `ClientStrategy backtest: time_expired close rejected by sync (signalId=${signal.id}). ` +
      `Retry backtest() with new candle data.`
    );
  }

  return timeExpiredResult;
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
  _lastPendingId: string | null = null;

  _scheduledSignal: IScheduledSignalRow | null = null;
  _cancelledSignal: IScheduledSignalCancelRow | null = null;
  _closedSignal: ISignalCloseRow | null = null;
  _activatedSignal: IScheduledSignalActivateRow | null = null;

  /**
   * Deferred broker-confirmed take-profit fill (set via createTakeProfit). When non-null, the
   * exchange reported the TP order was actually filled (e.g. by candle high/low) — the next
   * tick()/backtest() drains it and closes the pending position with closeReason "take_profit"
   * at the effective take-profit level, bypassing the VWAP-based TP check.
   */
  _takeProfitSignal: ISignalCloseRow | null = null;
  /**
   * Deferred broker-confirmed stop-loss fill (set via createStopLoss). When non-null, the
   * exchange reported the SL order was actually filled (e.g. by candle high/low) — the next
   * tick()/backtest() drains it and closes the pending position with closeReason "stop_loss"
   * at the effective stop-loss level, bypassing the VWAP-based SL check.
   */
  _stopLossSignal: ISignalCloseRow | null = null;

  /**
   * User-supplied signal DTO to be consumed by the next GET_SIGNAL_FN tick instead of
   * params.getSignal. Set via createSignal. When non-null, params.getSignal is NOT called
   * and the existing pipeline (priceOpen decides pending vs scheduled, onOrderSync on open)
   * is reused.
   */
  _userSignal: ISignalDto | null = null;

  /**
   * Gate-rejected open awaiting an identity-stable retry (CC_ORDER_OPEN_RETRY_ATTEMPTS).
   * When non-null, the next GET_SIGNAL_FN consumes this row instead of calling
   * params.getSignal and re-runs the normal open pipeline with the SAME signalId, so a
   * broker adapter that tags exchange orders with clientOrderId = signalId gets idempotent
   * placement: a retry after a LOST RESPONSE (order filled, confirmation never arrived)
   * resolves to "duplicate order" on the exchange and reconciles instead of double-buying.
   *
   * Write-ahead lifetime: the slot is persisted at rejection and stays on disk until the
   * open outcome is durable (successful open persisted / attempts exhausted / consumption
   * re-validation failed) — a crash right after the broker confirmed the open (but before
   * the pending snapshot was written) replays the same id and resolves on the exchange side.
   * Unused when CC_ORDER_OPEN_RETRY_ATTEMPTS is 0.
   */
  _retryOpenSignal: ISignalRow | IScheduledSignalRow | null = null;
  /**
   * Number of broker-gate rejections recorded for _retryOpenSignal's signalId. Incremented
   * by STASH_RETRY_OPEN_SIGNAL_FN on every rejection of the same id; once it exceeds
   * CC_ORDER_OPEN_RETRY_ATTEMPTS the row is dropped loudly and generation resumes.
   * Reset on successful open or when a different signalId gets rejected.
   */
  _retryOpenCount = 0;

  /**
   * Number of close-gate attempts STARTED for the current pending signal. PRE-ARMED:
   * incremented and PERSISTED inside CALL_ORDER_SYNC_CLOSE_FN BEFORE the gate call, so a
   * crash after the exit order was POSTed but before the verdict still counts the attempt —
   * after a restart the next close event carries `attempt = count - 1 >= 1` and the adapter
   * knows a prior exit MAY have reached the exchange (verify the position before
   * re-sending). Restored only when the persisted snapshot belongs to the restored pending
   * signal (pendingSignalId match) or to a deferred user-close drain (closedSignal present)
   * — a stale counter from a previous position must never shorten a new one's budget —
   * and CLAMPED to 1: through a restart only the `attempt >= 1` reconcile bit survives,
   * a pre-crash streak must not force-close on the first post-restart rejection.
   * Reset to 0 on a confirmed close, on force-close and on any pending-signal transition.
   * Once starts exceed CC_ORDER_CLOSE_RETRY_ATTEMPTS (or the gate returns the terminal
   * "rejected" verdict) the engine FORCE-CLOSES its state with the original closeReason,
   * loudly — see RESOLVE_CLOSE_GATE_FN.
   */
  _retryCloseCount = 0;

  /**
   * Number of CONSECUTIVE failed order-check pings (active OR scheduled — the states are
   * mutually exclusive, one counter serves both). Carried into the next signal-ping event
   * as `attempt`; reset to 0 on a successful check and on any signal transition. While it
   * stays within CC_ORDER_CHECK_RETRY_ATTEMPTS a failed check is tolerated as transient
   * (order assumed still open); exhaustion (or the terminal "deleted" verdict) triggers
   * the terminal action (close "closed" / cancel "user"). In-memory only, same rationale
   * as _retryCloseCount.
   */
  _orderCheckAttempt = 0;

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
   * Checks if there is a scheduled signal.
   *
   * @param symbol - Trading symbol to check for scheduled signal
   * @returns Promise resolving to true if a scheduled signal exists, false otherwise
   */
  public async hasScheduledSignal(symbol: string): Promise<boolean> {
    this.params.logger.debug("ClientStrategy hasScheduledSignal", {
      symbol,
    });
    return this._scheduledSignal !== null;
  }

  /**
   * Updates pending signal and persists to disk in live mode.
   *
   * Centralized method for all signal state changes.
   * Uses atomic file writes to prevent corruption.
   *
   * @param pendingSignal - New signal state (null to clear)
   * @param currentPrice - Current market price (forwarded to the onWrite callback)
   * @returns Promise that resolves when update is complete
   */
  public async setPendingSignal(pendingSignal: ISignalRow | null, currentPrice: number) {
    this.params.logger.debug("ClientStrategy setPendingSignal", {
      pendingSignal,
    });

    // КРИТИЧНО: Очищаем флаг закрытия при любом изменении pending signal
    // - при null: сигнал закрыт по TP/SL/timeout, флаг больше не нужен
    // - при новом сигнале: флаг от предыдущего сигнала не должен влиять на новый
    this._closedSignal = null;

    // КРИТИЧНО: Так же сбрасываем отложенные broker-confirmed TP/SL fills — закрытие позиции
    // любым путём делает их неактуальными, а новая позиция не должна унаследовать чужой fill.
    this._takeProfitSignal = null;
    this._stopLossSignal = null;

    // Счётчики последовательных сбоев close-гейта/чеков привязаны к позиции —
    // новая (или закрытая) позиция не должна наследовать чужую историю отказов.
    this._retryCloseCount = 0;
    this._orderCheckAttempt = 0;

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
        this.params.symbol,
        publicSignal,
        currentPrice,
        // ЕДИНСТВЕННОЕ контекстное чтение вне tick/backtest: метка времени для
        // onWrite (в backtest — время свечи, wall clock его не заменит).
        // Читается лениво и только при настроенном onWrite; сам метод
        // вызывается исключительно из tick/backtest-пайплайнов.
        this.params.execution.context.when,
        this.params.backtest
      );
    }

    if (this.params.backtest) {
      return;
    }

    await PersistSignalAdapter.writeSignalData(
      this._pendingSignal,
      this.params.symbol,
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
    // Это же затирание работает дедупликацией в гонке со stopStrategy: если tick
    // держал ссылку на scheduled и на await-точке stopStrategy успел конвертировать
    // его в _cancelledSignal, терминальная ветка (stopped/risk/sync-reject) сама
    // синхронно эмитит cancel-события ПОСЛЕ вызова setScheduledSignal(null) —
    // отложенная отмена стирается здесь, и дренаж не эмитит дубль.
    this._cancelledSignal = null;
    this._activatedSignal = null;

    // Счётчик последовательных сбоев order-check привязан к сигналу — новый
    // (или снятый) scheduled не должен наследовать чужую историю отказов.
    this._orderCheckAttempt = 0;

    this._scheduledSignal = scheduledSignal;

    if (this.params.backtest) {
      return;
    }

    await PersistScheduleAdapter.writeScheduleData(
      this._scheduledSignal,
      this.params.symbol,
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
    return this._pendingSignal ? TO_PUBLIC_SIGNAL("pending", this._pendingSignal, currentPrice) : null;
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
    return this._scheduledSignal ? TO_PUBLIC_SIGNAL("scheduled", this._scheduledSignal, currentPrice) : null;
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
      strategyName: this.params.strategyName,
    });
    return this._isStopped;
  }

  /**
   * Returns how much of the position is still held, as a percentage of totalInvested.
   *
   * NOTE: despite the name, this returns the REMAINING (still held) percent,
   * i.e. 100 - totalClosedPercent — the name is kept for public-API backward
   * compatibility.
   *
   * Uses dollar-basis cost-basis replay (DCA-aware).
   * 100% means nothing was closed yet. Decreases with each partial close.
   *
   * Example: 1 entry $100, partialProfit(30%) → returns 70
   * Example: 2 entries $200, partialProfit(50%) → returns 50
   *
   * Returns null if no pending signal exists; 100 if no partial closes yet.
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
   * Returns null if no pending signal exists; totalInvested if no partial closes yet.
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
  public async getPositionEffectivePrice(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionEffectivePrice", { symbol });
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
    return (this._pendingSignal._entry ?? []).reduce((s, e) => s + e.cost, 0) || (this._pendingSignal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST);
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

  /**
   * Returns the list of partial closes for the current pending signal.
   *
   * Each entry records a partial profit or loss close event with its type,
   * percent closed, price at close, cost basis snapshot, and entry count at close.
   *
   * Returns null if no pending signal exists.
   * Returns an empty array if no partial closes have been executed.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to array of partial close records or null
   */
  public async getPositionPartials(symbol: string): Promise<Partials | null> {
    this.params.logger.debug("ClientStrategy getPositionPartials", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._partial ?? [];
  }

  /**
   * Returns the list of DCA entry prices and costs for the current pending signal.
   *
   * Each entry records the price and cost of a single position entry.
   * The first element is always the original priceOpen (initial entry).
   * Each subsequent element is an entry added by averageBuy().
   *
   * Returns null if no pending signal exists.
   * Returns a single-element array [{ price: priceOpen, cost }] if no DCA entries were made.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to array of entry records or null
   *
   * @example
   * // No DCA: [{ price: 43000, cost: 100 }]
   * // One DCA: [{ price: 43000, cost: 100 }, { price: 42000, cost: 100 }]
   */
  public async getPositionEntries(symbol: string, timestamp: number): Promise<Entries | null> {
    this.params.logger.debug("ClientStrategy getPositionEntries", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    const entries = this._pendingSignal._entry;
    if (!entries || entries.length === 0) {
      // Use the signal's own cost — the constant would misreport a position
      // opened with a custom cost (keep in sync with AVERAGE_BUY_FN fallback)
      return [{ price: this._pendingSignal.priceOpen, cost: this._pendingSignal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST, timestamp }];
    }
    return entries.map(({ price, cost, timestamp }) => ({ price, cost, timestamp }));
  }

  /**
   * Returns the original estimated duration for the current pending signal.
   *
   * Reflects `minuteEstimatedTime` as set in the signal DTO — the maximum
   * number of minutes the position is expected to be active before `time_expired`.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to estimated duration in minutes or null
   */
  public async getPositionEstimateMinutes(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionEstimateMinutes", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal.minuteEstimatedTime;
  }

  /**
   * Returns the remaining time before the position expires, clamped to zero.
   *
   * Computes elapsed minutes since `pendingAt` and subtracts from `minuteEstimatedTime`.
   * Returns 0 once the estimate is exceeded (never negative).
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param timestamp - Current Unix timestamp in milliseconds
   * @returns Promise resolving to remaining minutes (≥ 0) or null
   */
  public async getPositionCountdownMinutes(symbol: string, timestamp: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionCountdownMinutes", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    const elapsed = Math.floor((timestamp - this._pendingSignal.pendingAt) / 60000);
    return Math.max(0, this._pendingSignal.minuteEstimatedTime - elapsed);
  }

  /**
   * Returns the best price reached in the profit direction during this position's life.
   *
   * Initialized at position open with the entry price and timestamp.
   * Updated on every tick/candle when VWAP moves beyond the previous record toward TP:
   * - LONG: tracks the highest price seen above effective entry
   * - SHORT: tracks the lowest price seen below effective entry
   *
   * Returns null if no pending signal exists.
   * Never returns null when a signal is active — always contains at least the entry price.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to price or null
   */
  public async getPositionHighestProfitPrice(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestProfitPrice", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._peak.price;
  }

  /**
   * Returns the timestamp when the best profit price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to timestamp in milliseconds or null
   */
  public async getPositionHighestProfitTimestamp(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestProfitTimestamp", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._peak.timestamp;
  }

  /**
   * Returns the PnL percentage at the moment the best profit price was recorded during this position's life.
   *
   * Initialized at position open with 0.
   * Updated on every tick/candle when VWAP moves beyond the previous record toward TP:
   * - LONG: tracks the PnL percentage at the highest price seen above effective entry
   * - SHORT: tracks the PnL percentage at the lowest price seen below effective entry
   *
   * Returns null if no pending signal exists.
   * Never returns null when a signal is active — always contains at least 0.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to PnL percentage or null
   */
  public async getPositionHighestPnlPercentage(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestPnlPercentage", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._peak.pnlPercentage;
  }

  /**
   * Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.
   *
   * Initialized at position open with 0.
   * Updated on every tick/candle when VWAP moves beyond the previous record toward TP:
   * - LONG: tracks the PnL cost at the highest price seen above effective entry
   * - SHORT: tracks the PnL cost at the lowest price seen below effective entry
   *
   * Returns null if no pending signal exists.
   * Never returns null when a signal is active — always contains at least 0.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to PnL cost or null
   */
  public async getPositionHighestPnlCost(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestPnlCost", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._peak.pnlCost;
  }

  /**
   * Returns whether the highest profit price recorded for this position has ever
   * covered the breakeven threshold (slippage + fees on both transactions plus
   * CC_BREAKEVEN_THRESHOLD margin) relative to the effective entry price.
   *
   * True means the peak was deep enough in profit that a breakeven SL could have
   * been set at that moment — regardless of where the price is now.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to boolean or null
   */
  public async getPositionHighestProfitBreakeven(symbol: string): Promise<boolean | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestProfitBreakeven", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    const signal = this._pendingSignal;
    const effectivePriceOpen = GET_EFFECTIVE_PRICE_OPEN(signal);
    const peakPrice = signal._peak.price;
    const breakevenThresholdPercent =
      (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2 + GLOBAL_CONFIG.CC_BREAKEVEN_THRESHOLD;
    if (signal.position === "long") {
      return peakPrice >= effectivePriceOpen * (1 + breakevenThresholdPercent / 100);
    } else {
      return peakPrice <= effectivePriceOpen * (1 - breakevenThresholdPercent / 100);
    }
  }

  /**
   * Returns the number of minutes elapsed since the highest profit price was recorded.
   *
   * Measures how long the position has been pulling back from its peak.
   * Zero when called at the exact moment the peak was set.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param timestamp - Current Unix timestamp in milliseconds
   * @returns Promise resolving to drawdown duration in minutes or null
   */
  public async getPositionDrawdownMinutes(symbol: string, timestamp: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionDrawdownMinutes", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return Math.floor((timestamp - this._pendingSignal._peak.timestamp) / 60000);
  }

  /**
   * Returns the number of minutes the position has been active since it opened.
   *
   * Computed as elapsed minutes since `pendingAt` (the moment the signal was activated).
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param timestamp - Current Unix timestamp in milliseconds
   * @returns Promise resolving to active minutes (≥ 0) or null
   */
  public async getPositionActiveMinutes(symbol: string, timestamp: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionActiveMinutes", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return Math.floor((timestamp - this._pendingSignal.pendingAt) / 60000);
  }

  /**
   * Returns the number of minutes the scheduled signal has been waiting for activation.
   *
   * Computed as elapsed minutes since `scheduledAt` (the moment the scheduled signal was created).
   * Returns null if no scheduled signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param timestamp - Current Unix timestamp in milliseconds
   * @returns Promise resolving to waiting minutes (≥ 0) or null
   */
  public async getPositionWaitingMinutes(symbol: string, timestamp: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionWaitingMinutes", { symbol });
    if (!this._scheduledSignal) {
      return null;
    }
    return Math.floor((timestamp - this._scheduledSignal.scheduledAt) / 60000);
  }

  /**
   * Returns the number of minutes elapsed since the highest profit price was recorded.
   *
   * Alias for getPositionDrawdownMinutes — measures how long the position has been
   * pulling back from its peak profit level.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param timestamp - Current Unix timestamp in milliseconds
   * @returns Promise resolving to minutes since last profit peak or null
   */
  public async getPositionHighestProfitMinutes(symbol: string, timestamp: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestProfitMinutes", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return Math.floor((timestamp - this._pendingSignal._peak.timestamp) / 60000);
  }

  /**
   * Returns the number of minutes elapsed since the worst loss price was recorded.
   *
   * Measures how long ago the deepest drawdown point occurred.
   * Zero when called at the exact moment the trough was set.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param timestamp - Current Unix timestamp in milliseconds
   * @returns Promise resolving to minutes since last drawdown trough or null
   */
  public async getPositionMaxDrawdownMinutes(symbol: string, timestamp: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionMaxDrawdownMinutes", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return Math.floor((timestamp - this._pendingSignal._fall.timestamp) / 60000);
  }

  /**
   * Returns the worst price reached in the loss direction during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to price or null
   */
  public async getPositionMaxDrawdownPrice(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionMaxDrawdownPrice", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._fall.price;
  }

  /**
   * Returns the timestamp when the worst loss price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to timestamp in milliseconds or null
   */
  public async getPositionMaxDrawdownTimestamp(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionMaxDrawdownTimestamp", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._fall.timestamp;
  }

  /**
   * Returns the PnL percentage at the moment the worst loss price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to PnL percentage or null
   */
  public async getPositionMaxDrawdownPnlPercentage(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionMaxDrawdownPnlPercentage", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._fall.pnlPercentage;
  }

  /**
   * Returns the PnL cost (in quote currency) at the moment the worst loss price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to PnL cost or null
   */
  public async getPositionMaxDrawdownPnlCost(symbol: string): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionMaxDrawdownPnlCost", { symbol });
    if (!this._pendingSignal) {
      return null;
    }
    return this._pendingSignal._fall.pnlCost;
  }

  /**
   * Returns the distance in PnL percentage between the current price and the highest profit peak.
   *
   * Measures how much PnL% the position has given back from its best point.
   * Computed as: max(0, peakPnlPercentage - currentPnlPercentage).
   * Zero when called at the exact moment the peak was set, or when current PnL >= peak PnL.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @returns Promise resolving to drawdown distance in PnL% (≥ 0) or null
   */
  public async getPositionHighestProfitDistancePnlPercentage(symbol: string, currentPrice: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestProfitDistancePnlPercentage", { symbol, currentPrice });
    if (!this._pendingSignal) {
      return null;
    }
    const currentPnl = toProfitLossDto(this._pendingSignal, currentPrice);
    return Math.max(0, this._pendingSignal._peak.pnlPercentage - currentPnl.pnlPercentage);
  }

  /**
   * Returns the distance in PnL cost between the current price and the highest profit peak.
   *
   * Measures how much PnL cost the position has given back from its best point.
   * Computed as: max(0, peakPnlCost - currentPnlCost).
   * Zero when called at the exact moment the peak was set, or when current PnL >= peak PnL.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @returns Promise resolving to drawdown distance in PnL cost (≥ 0) or null
   */
  public async getPositionHighestProfitDistancePnlCost(symbol: string, currentPrice: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestProfitDistancePnlCost", { symbol, currentPrice });
    if (!this._pendingSignal) {
      return null;
    }
    const currentPnl = toProfitLossDto(this._pendingSignal, currentPrice);
    return Math.max(0, this._pendingSignal._peak.pnlCost - currentPnl.pnlCost);
  }

  /**
   * Returns the distance in PnL percentage between the current price and the worst drawdown trough.
   *
   * Measures how much the position has recovered from its deepest loss point.
   * Computed as: max(0, currentPnlPercentage - fallPnlPercentage).
   * Zero when called at the exact moment the trough was set, or when current PnL <= trough PnL.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @returns Promise resolving to recovery distance in PnL% (≥ 0) or null
   */
  public async getPositionHighestMaxDrawdownPnlPercentage(symbol: string, currentPrice: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestMaxDrawdownPnlPercentage", { symbol, currentPrice });
    if (!this._pendingSignal) {
      return null;
    }
    const currentPnl = toProfitLossDto(this._pendingSignal, currentPrice);
    return Math.max(0, currentPnl.pnlPercentage - this._pendingSignal._fall.pnlPercentage);
  }

  /**
   * Returns the distance in PnL cost between the current price and the worst drawdown trough.
   *
   * Measures how much the position has recovered from its deepest loss point.
   * Computed as: max(0, currentPnlCost - fallPnlCost).
   * Zero when called at the exact moment the trough was set, or when current PnL <= trough PnL.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @returns Promise resolving to recovery distance in PnL cost (≥ 0) or null
   */
  public async getPositionHighestMaxDrawdownPnlCost(symbol: string, currentPrice: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getPositionHighestMaxDrawdownPnlCost", { symbol, currentPrice });
    if (!this._pendingSignal) {
      return null;
    }
    const currentPnl = toProfitLossDto(this._pendingSignal, currentPrice);
    return Math.max(0, currentPnl.pnlCost - this._pendingSignal._fall.pnlCost);
  }

  /**
   * Returns the peak-to-trough PnL percentage distance between the position's highest profit and deepest drawdown.
   *
   * Measures the total swing from the stored `_peak.pnlPercentage` to the stored `_fall.pnlPercentage`.
   * Computed as: max(0, peakPnlPercentage - fallPnlPercentage).
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @returns Promise resolving to peak-to-trough PnL percentage distance (≥ 0) or null
   */
  public async getMaxDrawdownDistancePnlPercentage(symbol: string, currentPrice: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getMaxDrawdownDistancePnlPercentage", { symbol, currentPrice });
    if (!this._pendingSignal) {
      return null;
    }
    return Math.max(0, this._pendingSignal._peak.pnlPercentage - this._pendingSignal._fall.pnlPercentage);
  }

  /**
   * Returns the peak-to-trough PnL cost distance between the position's highest profit and deepest drawdown.
   *
   * Measures the total swing from the stored `_peak.pnlCost` to the stored `_fall.pnlCost`.
   * Computed as: max(0, peakPnlCost - fallPnlCost).
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @returns Promise resolving to peak-to-trough PnL cost distance (≥ 0) or null
   */
  public async getMaxDrawdownDistancePnlCost(symbol: string, currentPrice: number): Promise<number | null> {
    this.params.logger.debug("ClientStrategy getMaxDrawdownDistancePnlCost", { symbol, currentPrice });
    if (!this._pendingSignal) {
      return null;
    }
    return Math.max(0, this._pendingSignal._peak.pnlCost - this._pendingSignal._fall.pnlCost);
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
    await PROCESS_COMMIT_QUEUE_FN(this, currentPrice, currentTime);

    // Check if scheduled signal was cancelled - emit cancelled event once
    // NOTE: No _isStopped check here - cancellation must work for graceful shutdown
    if (this._cancelledSignal) {
      const cancelledSignal = this._cancelledSignal;

      // Release the slot reserved at scheduled-signal creation BEFORE persisting
      // the drained flag: a crash in between replays the (idempotent) removal on
      // restart instead of orphaning the slot — an orphan blocks the shared
      // concurrency limit for the whole lifetime, forever for Infinity-hold
      // (expiry pruning never removes those, and no owner is left to removeSignal).
      await CALL_RISK_REMOVE_SIGNAL_FN(
        this,
        this.params.execution.context.symbol,
        currentTime,
        this.params.execution.context.backtest
      );

      this._cancelledSignal = null; // Clear after emitting

      // Persist the cleared deferred state so the drained flag is not replayed on restart
      await PERSIST_STRATEGY_FN(this);

      this.params.logger.info("ClientStrategy tick: scheduled signal was cancelled", {
        symbol: this.params.execution.context.symbol,
        signalId: cancelledSignal.id,
      });

      // Emit commit with correct timestamp from tick context
      const publicSignal = TO_PUBLIC_SIGNAL("scheduled", cancelledSignal, currentPrice);
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
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
        note: cancelledSignal.cancelNote ?? cancelledSignal.note,
      });

      await CALL_SCHEDULE_EVENT_FN(this, "cancelled", cancelledSignal, currentPrice, currentTime, "user");

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
        signal: publicSignal,
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
      const syncCloseAllowed = await CALL_ORDER_SYNC_CLOSE_FN(
        currentTime,
        currentPrice,
        "closed",
        closedSignal,
        this
      );

      const closeVerdict = RESOLVE_CLOSE_GATE_FN(this, syncCloseAllowed, closedSignal, "closed");
      if (closeVerdict === "retry") {
        this.params.logger.info("ClientStrategy tick: user-closed signal rejected by sync, will retry", {
          symbol: this.params.execution.context.symbol,
          signalId: closedSignal.id,
          attempt: this._retryCloseCount,
        });
        // Do NOT clear _closedSignal — retry on next tick (bounded by
        // CC_ORDER_CLOSE_RETRY_ATTEMPTS; exhaustion falls through and force-closes)
        return await RETURN_IDLE_FN(this, currentPrice);
      }
      // "allow" | "force" — proceed with the drain teardown (see RESOLVE_CLOSE_GATE_FN)

      // Release the risk slot BEFORE persisting the drained flag: a crash in
      // between replays the (idempotent) removal on restart instead of orphaning
      // the slot until lifetime expiry (forever for Infinity-hold positions).
      await CALL_RISK_REMOVE_SIGNAL_FN(
        this,
        this.params.execution.context.symbol,
        currentTime,
        this.params.execution.context.backtest
      );

      this._closedSignal = null; // Clear only after sync confirmed

      // Persist the cleared deferred state so the drained flag is not replayed on restart
      await PERSIST_STRATEGY_FN(this);

      this.params.logger.info("ClientStrategy tick: pending signal was closed", {
        symbol: this.params.execution.context.symbol,
        signalId: closedSignal.id,
      });

      // Emit commit with correct timestamp from tick context
      const publicSignal = TO_PUBLIC_SIGNAL("pending", closedSignal, currentPrice);
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
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
        note: closedSignal.closeNote ?? closedSignal.note,
      });

      await CALL_SIGNAL_EVENT_FN(this, "closed", closedSignal, currentPrice, currentTime, "closed");

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
      // (риск-слот уже освобождён ДО персиста дренированного флага — см. выше)
      await CALL_BREAKEVEN_CLEAR_FN(
        this,
        this.params.execution.context.symbol,
        closedSignal,
        currentPrice,
        currentTime,
        this.params.execution.context.backtest
      );

      const result: IStrategyTickResultClosed = {
        action: "closed",
        signal: publicSignal,
        currentPrice,
        closeReason: "closed",
        closeTimestamp: currentTime,
        pnl: publicSignal.pnl,
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

    // Check if a broker-confirmed take-profit fill is awaiting (createTakeProfit) - close once.
    // The exchange filled the TP order (e.g. by high/low); close bypassing the VWAP TP check.
    if (this._takeProfitSignal) {
      const filledSignal = this._takeProfitSignal;

      // Release the risk slot BEFORE persisting the drained flag (crash-safe:
      // removal is idempotent and re-runs on replay; the late removal inside
      // CLOSE_PENDING_SIGNAL_AS_FILL_FN stays for the backtest paths)
      await CALL_RISK_REMOVE_SIGNAL_FN(
        this,
        this.params.execution.context.symbol,
        currentTime,
        this.params.execution.context.backtest
      );

      this._takeProfitSignal = null; // Clear after draining

      // Persist the cleared deferred state so the drained flag is not replayed on restart
      await PERSIST_STRATEGY_FN(this);

      this.params.logger.info("ClientStrategy tick: pending signal closed by broker-confirmed take-profit fill", {
        symbol: this.params.execution.context.symbol,
        signalId: filledSignal.id,
      });

      return await CLOSE_PENDING_SIGNAL_AS_FILL_FN(this, filledSignal, "take_profit", currentTime);
    }

    // Check if a broker-confirmed stop-loss fill is awaiting (createStopLoss) - close once.
    // The exchange filled the SL order (e.g. by high/low); close bypassing the VWAP SL check.
    if (this._stopLossSignal) {
      const filledSignal = this._stopLossSignal;

      // Release the risk slot BEFORE persisting the drained flag (crash-safe:
      // removal is idempotent and re-runs on replay; the late removal inside
      // CLOSE_PENDING_SIGNAL_AS_FILL_FN stays for the backtest paths)
      await CALL_RISK_REMOVE_SIGNAL_FN(
        this,
        this.params.execution.context.symbol,
        currentTime,
        this.params.execution.context.backtest
      );

      this._stopLossSignal = null; // Clear after draining

      // Persist the cleared deferred state so the drained flag is not replayed on restart
      await PERSIST_STRATEGY_FN(this);

      this.params.logger.info("ClientStrategy tick: pending signal closed by broker-confirmed stop-loss fill", {
        symbol: this.params.execution.context.symbol,
        signalId: filledSignal.id,
      });

      return await CLOSE_PENDING_SIGNAL_AS_FILL_FN(this, filledSignal, "stop_loss", currentTime);
    }

    // Check if scheduled signal was activated - emit opened event once
    if (this._activatedSignal) {
      const currentPrice = await this.params.exchange.getAveragePrice(
        this.params.execution.context.symbol
      );

      const activatedSignal = this._activatedSignal;
      this._activatedSignal = null; // Clear after emitting

      // Persist the cleared deferred state so the drained flag is not replayed on restart
      await PERSIST_STRATEGY_FN(this);

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
        // Release the slot reserved at scheduled-signal creation
        await CALL_RISK_REMOVE_SIGNAL_FN(
          this,
          this.params.execution.context.symbol,
          currentTime,
          this.params.execution.context.backtest
        );
        // The signal is dropped for good — emit the cancellation so the broker
        // adapter cancels the real resting order and subscribers (commit +
        // schedule event) see the drop instead of the signal silently vanishing
        {
          const publicSignal = TO_PUBLIC_SIGNAL("scheduled", activatedSignal, currentPrice);
          await CALL_SCHEDULE_EVENT_FN(this, "cancelled", activatedSignal, currentPrice, currentTime, "user");
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
            pnl: publicSignal.pnl,
            maxDrawdown: publicSignal.maxDrawdown,
            peakProfit: publicSignal.peakProfit,
            signal: publicSignal,
            note: activatedSignal.activateNote ?? activatedSignal.note,
          });
        }
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
        // Release the slot reserved at scheduled-signal creation (the activation
        // check above returned false, so no new reservation replaced it)
        await CALL_RISK_REMOVE_SIGNAL_FN(
          this,
          this.params.execution.context.symbol,
          currentTime,
          this.params.execution.context.backtest
        );
        // The signal is dropped for good — emit the cancellation so subscribers
        // (commit + schedule event) see it instead of the signal silently vanishing
        {
          const publicSignal = TO_PUBLIC_SIGNAL("scheduled", activatedSignal, currentPrice);
          await CALL_SCHEDULE_EVENT_FN(this, "cancelled", activatedSignal, currentPrice, currentTime, "user");
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
            pnl: publicSignal.pnl,
            maxDrawdown: publicSignal.maxDrawdown,
            peakProfit: publicSignal.peakProfit,
            signal: publicSignal,
            note: activatedSignal.activateNote ?? activatedSignal.note,
          });
        }
        return await RETURN_IDLE_FN(this, currentPrice);
      }

      // КРИТИЧЕСКИ ВАЖНО: обновляем pendingAt при активации
      const pendingSignal: ISignalRow = {
        ...activatedSignal,
        pendingAt: currentTime,
        _isScheduled: false,
        _peak: { price: activatedSignal.priceOpen, timestamp: currentTime, pnlPercentage: 0, pnlCost: 0, priceClose: 0, pnlEntries: 0, priceOpen: 0 },
        _fall: { price: activatedSignal.priceOpen, timestamp: currentTime, pnlPercentage: 0, pnlCost: 0, priceClose: 0, pnlEntries: 0, priceOpen: 0 },
      };
      {
        const { pnlPercentage, pnlCost, pnlEntries, priceClose, priceOpen } = toProfitLossDto(pendingSignal, pendingSignal.priceOpen);
        pendingSignal._fall = { price: pendingSignal.priceOpen, timestamp: currentTime, pnlPercentage, pnlCost, priceClose, pnlEntries, priceOpen };
      }

      const syncOpenAllowed = await CALL_ORDER_SYNC_OPEN_FN(currentTime, currentPrice, pendingSignal, this);
      if (syncOpenAllowed.reason !== "confirmed") {
        this.params.logger.info("ClientStrategy tick: user-activated signal rejected by sync", {
          symbol: this.params.execution.context.symbol,
          signalId: activatedSignal.id,
        });
        await this.setScheduledSignal(null);
        // Release the slot reserved by checkSignalAndReserve above
        await CALL_RISK_REMOVE_SIGNAL_FN(
          this,
          this.params.execution.context.symbol,
          currentTime,
          this.params.execution.context.backtest
        );
        const publicSignal = TO_PUBLIC_SIGNAL("scheduled", activatedSignal, currentPrice);
        // Notify the broker channel too — commit alone bypasses Broker.commitScheduleCancelled,
        // leaving the real resting order alive on the exchange
        await CALL_SCHEDULE_EVENT_FN(this, "cancelled", activatedSignal, currentPrice, currentTime, "user");
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
          pnl: publicSignal.pnl,
          maxDrawdown: publicSignal.maxDrawdown,
          peakProfit: publicSignal.peakProfit,
          signal: publicSignal,
          note: activatedSignal.activateNote ?? activatedSignal.note,
        });
        return await RETURN_IDLE_FN(this, currentPrice);
      }

      await this.setPendingSignal(pendingSignal, currentPrice);

      // Whipsaw protection: record the id only after a successful open
      this._lastPendingId = pendingSignal.id;

      await CALL_RISK_ADD_SIGNAL_FN(
        this,
        this.params.execution.context.symbol,
        pendingSignal,
        currentTime,
        this.params.execution.context.backtest
      );

      // Emit commit AFTER successful risk check
      const publicSignalForCommit = TO_PUBLIC_SIGNAL("pending", pendingSignal, currentPrice);
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
        pnl: publicSignalForCommit.pnl,
        maxDrawdown: publicSignalForCommit.maxDrawdown,
        peakProfit: publicSignalForCommit.peakProfit,
        signal: publicSignalForCommit,
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
        note: activatedSignal.activateNote ?? publicSignalForCommit.note,
      });

      await CALL_SIGNAL_EVENT_FN(this, "opened", pendingSignal, currentPrice, currentTime);

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
        signal: publicSignalForCommit,
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

      // Scheduled-order ping (type "schedule"): before evaluating timeout/price
      // activation, confirm the resting entry order is STILL open on the exchange.
      // Mirrors the pending-order ping: a FAILED check ("transient") is tolerated up
      // to CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive times (network blip must not
      // cancel a real resting order); exhaustion — or the "deleted" verdict
      // (OrderDeletedError: confirmed not-found) — cancels the scheduled signal.
      // If the order actually filled, the adapter must call activateScheduled
      // instead of failing the ping. Skipped in backtest: no live exchange to query.
      if (!this.params.execution.context.backtest) {
        const stillScheduled = await CALL_SCHEDULED_ORDER_CHECK_FN(
          currentTime,
          currentPrice,
          this._scheduledSignal,
          this
        );
        // Зеркало гарда pending-монитора ниже: слушатель пинга мог потребить
        // scheduled deferred-командой (activateScheduled / cancelScheduled) —
        // _scheduledSignal уже null, deferred-слот дренится следующим tick.
        // Провал дальше упал бы с TypeError на null-сигнале.
        if (!this._scheduledSignal) {
          return await RETURN_IDLE_FN(this, currentPrice);
        }
        if (stillScheduled.reason === "confirmed") {
          this._orderCheckAttempt = 0;
        } else {
          this._orderCheckAttempt += 1;
          const terminal = stillScheduled.reason !== "transient"
            || GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS <= 0
            || this._orderCheckAttempt > GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS;
          if (terminal) {
            // Исчерпание толерантности ТРАНЗИЕНТНЫМИ сбоями = сеть не даёт проверить
            // resting-ордер — продолжать работу нельзя: фатальный сигнал ПОСЛЕ
            // errorEmitter-лога. "deleted" (подтверждённый not-found) и legacy CC=0 —
            // не сетевые кейсы, без exit.
            if (stillScheduled.reason === "transient" && GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS > 0) {
              const message = "ClientStrategy tick: scheduled-order check attempts exhausted (network), cancelling scheduled signal and signaling fatal exit";
              const payload = {
                symbol: this.params.execution.context.symbol,
                strategyName: this.params.strategyName,
                signalId: this._scheduledSignal.id,
                attempts: this._orderCheckAttempt,
                maxAttempts: GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS,
              };
              this.params.logger.warn(message, payload);
              console.warn(message, payload);
              const error = new Error(message);
              errorEmitter.next(error);
              exitEmitter.next(error);
            }
            this._orderCheckAttempt = 0;
            return await CANCEL_SCHEDULED_SIGNAL_AS_CLOSED_FN(
              this,
              this._scheduledSignal,
              currentPrice
            );
          }
          // Transient failure tolerated: the resting order is assumed still open
          this.params.logger.warn("ClientStrategy tick: scheduled-order check failed, tolerated as transient", {
            symbol: this.params.execution.context.symbol,
            signalId: this._scheduledSignal.id,
            attempt: this._orderCheckAttempt,
            maxAttempts: GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS,
          });
        }
      }

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
          // The scheduled signal is set/persisted INSIDE OPEN_NEW_SCHEDULED_SIGNAL_FN,
          // strictly after the sync confirmation of the resting-order placement
          // (type "schedule") — same contract as OPEN_NEW_PENDING_SIGNAL_FN below.
          const scheduledResult = await OPEN_NEW_SCHEDULED_SIGNAL_FN(
            this,
            signal as IScheduledSignalRow
          );
          if (scheduledResult) {
            return scheduledResult;
          }
          // Sync rejected — nothing was registered, fall through to idle
        } else {
          // The pending signal is set/persisted INSIDE OPEN_NEW_PENDING_SIGNAL_FN,
          // strictly after the sync-open confirmation. Setting it here first left a
          // phantom position on disk when the process crashed before the broker
          // confirmed (or rejected) the open.
          const openResult = await OPEN_NEW_PENDING_SIGNAL_FN(this, signal as ISignalRow);
          if (openResult) {
            return openResult;
          }
          // Sync rejected — nothing was persisted, fall through to idle
        }
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

    // Pending-order ping: before evaluating TP/SL/time, confirm the order is STILL open on the
    // exchange. CALL_ORDER_CHECK_FN returns false when the listener returns false OR throws
    // (Subject .next passthrough), meaning the order is no longer pending — close with "closed".
    // Skipped in backtest: there is no live exchange to query.
    if (!this.params.execution.context.backtest) {
      const stillPending = await CALL_ORDER_CHECK_FN(
        currentTime,
        averagePrice,
        this._pendingSignal,
        this
      );
      // Слушатель пинга мог потребить pending прямо посреди тика deferred-
      // командой (createTakeProfit / createStopLoss / closePending): брокер
      // подтвердил филл/закрытие out-of-band, снапшот уже лежит в deferred-
      // слоте. Проваливаться дальше с null-сигналом нельзя (completion-чек
      // упадёт с TypeError), закрывать "closed" поверх — тоже: подтверждённый
      // филл ВЫИГРЫВАЕТ у вердикта пинга и дренится следующим tick со своим
      // истинным closeReason.
      if (!this._pendingSignal) {
        return await RETURN_IDLE_FN(this, averagePrice);
      }
      if (stillPending.reason === "confirmed") {
        this._orderCheckAttempt = 0;
      } else {
        this._orderCheckAttempt += 1;
        // A FAILED check ("transient") is tolerated up to CC_ORDER_CHECK_RETRY_ATTEMPTS
        // consecutive times — a network blip must not close a live position. Exhaustion
        // — or the "deleted" verdict (OrderDeletedError: confirmed not-found) — closes
        // the position with closeReason "closed".
        const terminal = stillPending.reason !== "transient"
          || GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS <= 0
          || this._orderCheckAttempt > GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS;
        if (terminal) {
          // Исчерпание толерантности ТРАНЗИЕНТНЫМИ сбоями = сеть не даёт проверить
          // ордер позиции — продолжать работу нельзя: фатальный сигнал ПОСЛЕ
          // errorEmitter-лога. "deleted" (подтверждённый not-found) и legacy CC=0 —
          // не сетевые кейсы, без exit.
          if (stillPending.reason === "transient" && GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS > 0) {
            const message = "ClientStrategy tick: pending-order check attempts exhausted (network), closing position and signaling fatal exit";
            const payload = {
              symbol: this.params.execution.context.symbol,
              strategyName: this.params.strategyName,
              signalId: this._pendingSignal.id,
              attempts: this._orderCheckAttempt,
              maxAttempts: GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS,
            };
            this.params.logger.warn(message, payload);
            console.warn(message, payload);
            const error = new Error(message);
            errorEmitter.next(error);
            exitEmitter.next(error);
          }
          this._orderCheckAttempt = 0;
          return await CLOSE_PENDING_SIGNAL_AS_CLOSED_FN(
            this,
            this._pendingSignal,
            averagePrice
          );
        }
        // Transient failure tolerated: the order is assumed still open, monitoring continues
        this.params.logger.warn("ClientStrategy tick: pending-order check failed, tolerated as transient", {
          symbol: this.params.execution.context.symbol,
          signalId: this._pendingSignal.id,
          attempt: this._orderCheckAttempt,
          maxAttempts: GLOBAL_CONFIG.CC_ORDER_CHECK_RETRY_ATTEMPTS,
        });
      }
    }

    const closedResult = await CHECK_PENDING_SIGNAL_COMPLETION_FN(
      this,
      this._pendingSignal,
      averagePrice
    );

    if (closedResult) {
      return closedResult;
    }

    // Слушатель sync-close гейта мог ОТВЕРГНУТЬ закрытие и одновременно
    // потребить pending deferred-командой («не закрывай по времени — ордер
    // реально исполнился по TP»): completion вернул null, а снапшот уже лежит
    // в deferred-слоте. Провал в RETURN_PENDING_SIGNAL_ACTIVE_FN(null) падал
    // с TypeError — дренаж следующим tick, как в гарде check-пинга выше.
    if (!this._pendingSignal) {
      return await RETURN_IDLE_FN(this, averagePrice);
    }

    return await RETURN_PENDING_SIGNAL_ACTIVE_FN(
      this,
      this._pendingSignal,
      averagePrice,
      this.params.execution.context.backtest
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
   * 1. Skips the first CC_AVG_PRICE_CANDLES_COUNT - 1 buffer candles (VWAP window)
   * 2. Checks TP/SL against the VWAP of the last CC_AVG_PRICE_CANDLES_COUNT candles
   *    (NOT candle high/low — only scheduled activation/cancellation uses low/high;
   *    pending TP/SL uses VWAP, mirroring live monitoring)
   * 3. Closes at the exact effective TP/SL level (trailing-aware) or by time_expired
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
    candles: ICandleData[],
    frameEndTime: number,
  ): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive> {
    this.params.logger.debug("ClientStrategy backtest", {
      symbol,
      strategyName,
      contextSymbol: this.params.execution.context.symbol,
      candlesCount: candles.length,
      hasScheduled: !!this._scheduledSignal,
      hasPending: !!this._pendingSignal,
      frameEndTime,
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

      // Release the slot reserved at scheduled-signal creation
      await CALL_RISK_REMOVE_SIGNAL_FN(
        this,
        this.params.execution.context.symbol,
        closeTimestamp,
        this.params.execution.context.backtest
      );

      // Emit commit with correct timestamp from backtest context
      const publicSignal = TO_PUBLIC_SIGNAL("scheduled", cancelledSignal, currentPrice);
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
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
        note: cancelledSignal.cancelNote ?? cancelledSignal.note,
      });

      await CALL_SCHEDULE_EVENT_FN(this, "cancelled", cancelledSignal, currentPrice, closeTimestamp, "user");

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
        signal: publicSignal,
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

      // Sync close: if external system rejects — keep the close pending and re-attempt
      // it inside the candle loop below (PROCESS_PENDING_SIGNAL_CANDLES_FN handles
      // _closedSignal per candle). Mirrors live tick, which keeps _closedSignal and
      // retries on the next tick instead of failing.
      const syncCloseAllowed = await CALL_ORDER_SYNC_CLOSE_FN(
        closeTimestamp,
        currentPrice,
        "closed",
        closedSignal,
        this
      );

      const closeVerdict = RESOLVE_CLOSE_GATE_FN(this, syncCloseAllowed, closedSignal, "closed");
      if (closeVerdict === "retry") {
        this.params.logger.info("ClientStrategy backtest: user-closed signal rejected by sync, will retry in candle loop", {
          symbol: this.params.execution.context.symbol,
          signalId: closedSignal.id,
          attempt: this._retryCloseCount,
        });
        // Restore _pendingSignal so the candle loop processes the position normally;
        // _closedSignal is kept so the loop re-attempts the close on each candle
        // (bounded by CC_ORDER_CLOSE_RETRY_ATTEMPTS; exhaustion force-closes there).
        this._pendingSignal = closedSignal;
        return await PROCESS_PENDING_SIGNAL_CANDLES_FN(
          this,
          this._pendingSignal,
          candles,
          frameEndTime
        );
      }
      // "allow" | "force" — proceed with the drain teardown (see RESOLVE_CLOSE_GATE_FN)

      this._closedSignal = null; // Clear only after sync confirmed

      // Emit commit with correct timestamp from backtest context
      const publicSignal = TO_PUBLIC_SIGNAL("pending", closedSignal, currentPrice);
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
        pnl: publicSignal.pnl,
        maxDrawdown: publicSignal.maxDrawdown,
        peakProfit: publicSignal.peakProfit,
        signal: publicSignal,
        note: closedSignal.closeNote ?? closedSignal.note,
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

      const closedResult: IStrategyTickResultClosed = {
        action: "closed",
        signal: publicSignal,
        currentPrice,
        closeReason: "closed",
        closeTimestamp: closeTimestamp,
        pnl: publicSignal.pnl,
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

    // If a broker-confirmed take-profit fill is awaiting (createTakeProfit) - close once.
    // The exchange filled the TP order (e.g. by high/low); close bypassing the VWAP TP check.
    if (this._takeProfitSignal) {
      this.params.logger.debug("ClientStrategy backtest: pending signal closed by broker-confirmed take-profit fill");

      const filledSignal = this._takeProfitSignal;
      this._takeProfitSignal = null; // Clear after draining

      const closeTimestamp = this.params.execution.context.when.getTime();

      return await CLOSE_PENDING_SIGNAL_AS_FILL_FN(this, filledSignal, "take_profit", closeTimestamp);
    }

    // If a broker-confirmed stop-loss fill is awaiting (createStopLoss) - close once.
    // The exchange filled the SL order (e.g. by high/low); close bypassing the VWAP SL check.
    if (this._stopLossSignal) {
      this.params.logger.debug("ClientStrategy backtest: pending signal closed by broker-confirmed stop-loss fill");

      const filledSignal = this._stopLossSignal;
      this._stopLossSignal = null; // Clear after draining

      const closeTimestamp = this.params.execution.context.when.getTime();

      return await CLOSE_PENDING_SIGNAL_AS_FILL_FN(this, filledSignal, "stop_loss", closeTimestamp);
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

      const scheduledResult =
        await PROCESS_SCHEDULED_SIGNAL_CANDLES_FN(this, scheduled, candles, frameEndTime);

      if (scheduledResult.outcome === "cancelled") {
        return scheduledResult.result;
      }

      if (scheduledResult.outcome === "activated") {
        const { activationIndex } = scheduledResult;
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
      // Активация, поданная из onSchedulePing на ПОСЛЕДНЕЙ свече цикла:
      // scheduled потреблён в _activatedSignal, а свечей для inline-открытия и
      // мониторинга не осталось. Честная ошибка вместо вводящего в заблуждение
      // фатала ниже (симметрично insufficient-candles при price-активации у
      // края окна).
      if (this._activatedSignal) {
        throw new Error(
          `ClientStrategy backtest: user activation (activateScheduled) consumed the scheduled signal on the final candle (signalId=${this._activatedSignal.id}); ` +
          `no candles remain to open and monitor the activated position. Provide a candle range extending past the activation point.`
        );
      }
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

    return await PROCESS_PENDING_SIGNAL_CANDLES_FN(
      this,
      signal,
      candles,
      frameEndTime
    );
  }

  /**
   * Stops the strategy from generating new signals.
   *
   * Sets internal flag to prevent getSignal from being called.
   * A scheduled signal (not yet activated) is routed through the deferred-cancel
   * pipeline instead of being silently dropped: the next tick emits the
   * cancel-scheduled commit and onScheduleEvent("cancelled"), which reaches the
   * broker adapter (so the real resting order on the exchange is cancelled) and
   * releases the risk reservation. The deferred cancel is persisted, so a crash
   * before the next tick restores and drains it after restart.
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
   * // Existing signal will continue until natural close;
   * // a scheduled signal is cancelled on the next tick (broker notified)
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
      hasTakeProfitSignal: this._takeProfitSignal !== null,
      hasStopLossSignal: this._stopLossSignal !== null,
    });

    this._isStopped = true;

    // A queued createSignal DTO is an explicit intent to open a NEW position —
    // stop voids it, like it cancels a scheduled signal. Nothing was placed on
    // the exchange for a queued DTO, so the drop is safe. Without this,
    // _isStopped (deliberately NOT persisted: restart = operator intent to run)
    // left the DTO on disk and the next restart silently opened a stale position.
    const droppedUserSignal = this._userSignal !== null;
    this._userSignal = null;

    // NOTE: _isStopped blocks NEW position opening, but deferred user commands
    // and broker-confirmed fills must still drain on subsequent ticks:
    // - _cancelledSignal / _closedSignal are KEPT — their drain emits the
    //   cancel/close event, notifies the broker adapter and releases risk;
    //   wiping them here would lose a user-requested cancel/close issued just
    //   before the stop and desync the framework from the exchange.
    // - _takeProfitSignal / _stopLossSignal are KEPT — a broker-confirmed fill
    //   reflects a real exchange close that must still drain to emit the closed
    //   event, the same way an existing _pendingSignal keeps being monitored
    //   until its natural close.
    // - _activatedSignal is converted into a cancellation below — activation is
    //   blocked while stopped, and the resting order behind it must be
    //   cancelled on the exchange rather than silently dropped.
    // - _retryOpenSignal is KEPT — unlike the queued createSignal DTO, a
    //   gate-rejected open may have a REAL order on the exchange (the rejection
    //   could be a lost response to a filled order); dropping it here would
    //   recreate the orphan-position risk the retry exists to prevent. While
    //   stopped GET_SIGNAL_FN never drains it, so it stays frozen on disk and
    //   resumes (idempotently, same signalId) after a restart.

    // Route the scheduled signal (or a deferred activation of it) through the
    // deferred-cancel pipeline instead of dropping it silently. The next tick's
    // _cancelledSignal drain emits the cancel-scheduled commit and
    // onScheduleEvent("cancelled") — reaching the broker adapter via
    // scheduleEventSubject so the real resting order is cancelled — and
    // releases the risk reservation taken at scheduled-signal creation.
    const signalToCancel = this._scheduledSignal ?? this._activatedSignal;
    this._activatedSignal = null;
    this._scheduledSignal = null;

    if (!signalToCancel) {
      // Persist the dropped createSignal DTO even when there is nothing to
      // cancel — otherwise a crash after stop restores and opens it.
      if (droppedUserSignal && !backtest) {
        await PERSIST_STRATEGY_FN(this);
      }
      return;
    }

    if (!this._cancelledSignal) {
      this._cancelledSignal = Object.assign({}, signalToCancel, {
        cancelId: undefined as string | undefined,
        cancelNote: "stop_strategy",
      });
    }

    if (backtest) {
      // Commit will be emitted in backtest() with correct candle timestamp
      // (if the backtest loop performs another tick before terminating)
      return;
    }

    // Write-ahead order: persist the deferred _cancelledSignal BEFORE wiping the
    // scheduled snapshot — a crash between the writes then leaves both on disk and
    // waitForInit reconciles by id (the reverse order lost the cancel silently).
    await PERSIST_STRATEGY_FN(this);

    await PersistScheduleAdapter.writeScheduleData(
      this._scheduledSignal,
      symbol,
      this.params.strategyName,
      this.params.exchangeName,
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
  public async cancelScheduled(symbol: string, backtest: boolean, payload: Partial<CommitPayload>): Promise<void> {
    const cancelId = payload.id;
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
        cancelNote: payload.note,
      });
      this._scheduledSignal = null;
    }

    if (backtest) {
      // Commit will be emitted in backtest() with correct candle timestamp
      return;
    }

    // Write-ahead order: persist the deferred _cancelledSignal BEFORE wiping the
    // scheduled snapshot — a crash between the writes then leaves both on disk and
    // waitForInit reconciles by id (the reverse order lost the cancel silently).
    await PERSIST_STRATEGY_FN(this);

    await PersistScheduleAdapter.writeScheduleData(
      this._scheduledSignal,
      symbol,
      this.params.strategyName,
      this.params.exchangeName,
    );

    // Commit will be emitted in tick() with correct currentTime
  }

  /**
   * Activates the scheduled signal without waiting for the framework's VWAP to
   * reach priceOpen.
   *
   * SEMANTICS: calling this means the exchange actually filled OUR resting order
   * (the broker adapter confirms the fill out of band — e.g. the order filled on
   * a wick the VWAP never showed). The entry basis therefore stays at the
   * scheduled priceOpen: that IS the real fill price of the limit order. The
   * risk check runs against the current price, but PnL/TP/SL distances remain
   * anchored to priceOpen.
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
  public async activateScheduled(symbol: string, backtest: boolean, payload: Partial<CommitPayload>): Promise<void> {
    const activateId = payload.id;
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
        activateNote: payload.note,
      });
      this._scheduledSignal = null;
    }

    if (backtest) {
      // Commit will be emitted AFTER successful risk check in PROCESS_SCHEDULED_SIGNAL_CANDLES_FN
      return;
    }

    // Write-ahead order: persist the deferred _activatedSignal BEFORE wiping the
    // scheduled snapshot — a crash between the writes then leaves both on disk and
    // waitForInit reconciles by id (the reverse order lost the activation silently).
    await PERSIST_STRATEGY_FN(this);

    await PersistScheduleAdapter.writeScheduleData(
      this._scheduledSignal,
      symbol,
      this.params.strategyName,
      this.params.exchangeName,
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
  public async closePending(symbol: string, backtest: boolean, payload: Partial<CommitPayload>): Promise<void> {
    const closeId = payload.id;
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
        closeNote: payload.note,
      });
      this._pendingSignal = null;
    }

    if (backtest) {
      // Commit will be emitted in backtest() with correct candle timestamp
      return;
    }

    // Write-ahead order: persist the deferred _closedSignal (the intent) BEFORE
    // wiping the pending snapshot from disk. A crash between the two writes then
    // leaves BOTH snapshots — waitForInit detects the id match, skips restoring
    // the stale pending and finishes the wipe. The reverse order silently lost
    // the position (neither pending nor deferred close survived the crash).
    await PERSIST_STRATEGY_FN(this);

    await PersistSignalAdapter.writeSignalData(
      this._pendingSignal,
      symbol,
      this.params.strategyName,
      this.params.exchangeName,
    );

    // Commit will be emitted in tick() with correct currentTime
  }

  /**
   * Queues a user-supplied signal DTO to be consumed by the next tick instead of
   * params.getSignal.
   *
   * Works OUT of the async-hooks execution context (uses this.params.symbol directly).
   * priceOpen decides the outcome in the existing pipeline: when omitted the position opens
   * immediately at currentPrice; when provided the pipeline opens immediately if priceOpen is
   * already reached, otherwise registers a scheduled (priceOpen-awaiting) signal. On the next
   * tick GET_SIGNAL_FN consumes _userSignal and runs the normal pipeline, so onOrderSync
   * delivery is checked by OPEN_NEW_PENDING_SIGNAL_FN exactly as for a getSignal-produced signal.
   *
   * Validation (BEFORE any state mutation — a rejected call stores nothing):
   * - The DTO must pass the intrinsic shape/price checks.
   * - There must be NO signal already in flight: no active pending signal, no scheduled signal,
   *   no already-queued createSignal, and no deferred activate/close/cancel awaiting drain.
   *   Creating a new signal on top of an existing one is rejected.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - Current market price (priceOpen fallback for immediate signals)
   * @param dto - Signal DTO to open (priceOpen optional)
   * @returns Promise that resolves when the DTO is queued (and persisted in live mode)
   * @throws {Error} If the DTO is invalid or a signal/deferred action is already in flight
   */
  public async createSignal(symbol: string, currentPrice: number, dto: ISignalDto): Promise<void> {
    this.params.logger.debug("ClientStrategy createSignal", { symbol, currentPrice });

    // Queueing a DTO is opening a NEW position — blocked while stopped,
    // mirroring activateScheduled (stopStrategy likewise voids an already
    // queued DTO).
    if (this._isStopped) {
      throw new Error(`ClientStrategy createSignal: strategy is stopped for symbol=${symbol}`);
    }

    // Validate BEFORE mutating state — a bad DTO or a busy strategy must store nothing.
    // Reuse validateSignal (the canonical getSignal-output validator, branching
    // pending-vs-scheduled by the same rule as GET_SIGNAL_FN). It forwards to
    // validateCommonSignal which requires priceOpen and minuteEstimatedTime, so normalize the
    // DTO to the defaults GET_SIGNAL_FN would apply (priceOpen → currentPrice for an immediate
    // signal, minuteEstimatedTime → CC_MAX_SIGNAL_LIFETIME_MINUTES). The original dto stored in
    // _userSignal is left untouched so GET_SIGNAL_FN applies its own defaults on consume.
    if (!validateSignal(
      {
        ...dto,
        priceOpen: dto.priceOpen ?? currentPrice,
        minuteEstimatedTime: dto.minuteEstimatedTime ?? GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES,
      },
      currentPrice,
    )) {
      throw new Error(`ClientStrategy createSignal: invalid signal DTO for symbol=${symbol}`);
    }

    // Reject if any signal is already in flight or any deferred action is awaiting drain.
    if (this._pendingSignal) {
      throw new Error(`ClientStrategy createSignal: a pending signal already exists for symbol=${symbol}`);
    }
    if (this._scheduledSignal) {
      throw new Error(`ClientStrategy createSignal: a scheduled signal already exists for symbol=${symbol}`);
    }
    if (this._userSignal) {
      throw new Error(`ClientStrategy createSignal: a signal is already queued for creation for symbol=${symbol}`);
    }
    if (this._activatedSignal) {
      throw new Error(`ClientStrategy createSignal: a scheduled activation is pending for symbol=${symbol}`);
    }
    if (this._closedSignal) {
      throw new Error(`ClientStrategy createSignal: a pending close is awaiting for symbol=${symbol}`);
    }
    if (this._cancelledSignal) {
      throw new Error(`ClientStrategy createSignal: a scheduled cancel is awaiting for symbol=${symbol}`);
    }
    if (this._takeProfitSignal) {
      throw new Error(`ClientStrategy createSignal: a take-profit fill is awaiting for symbol=${symbol}`);
    }
    if (this._stopLossSignal) {
      throw new Error(`ClientStrategy createSignal: a stop-loss fill is awaiting for symbol=${symbol}`);
    }
    if (this._retryOpenSignal) {
      throw new Error(`ClientStrategy createSignal: a rejected open is awaiting retry for symbol=${symbol}`);
    }

    this._userSignal = dto;

    await PERSIST_STRATEGY_FN(this);
  }

  /**
   * Reports that the pending position's take-profit order was actually filled on the exchange
   * (e.g. by candle high/low), forcing a close that does not wait for the VWAP-based TP check.
   *
   * The exchange and the strategy are parallel states: ClientStrategy evaluates TP/SL against
   * VWAP, but the real order may close on high/low. This bridges that gap — the broker confirms
   * the fill OUT of the async-hooks execution context, the current pending signal is snapshotted
   * into _takeProfitSignal and cleared, and the next tick()/backtest() drains it, closing the
   * position with closeReason "take_profit" at the effective take-profit level.
   *
   * No-op if no pending signal exists. Persisted (live mode only) so a crash before the next
   * tick does not lose the deferred close.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param backtest - Whether running in backtest mode
   * @param payload - Optional commit id/note attached to the close
   * @returns Promise that resolves when the take-profit fill is queued
   */
  public async createTakeProfit(symbol: string, backtest: boolean, payload: Partial<CommitPayload>): Promise<void> {
    const closeId = payload.id;
    this.params.logger.debug("ClientStrategy createTakeProfit", {
      symbol,
      hasPendingSignal: this._pendingSignal !== null,
      closeId,
    });

    // Snapshot the pending signal for the next tick/backtest to close with reason "take_profit".
    if (this._pendingSignal) {
      this._takeProfitSignal = Object.assign({}, this._pendingSignal, {
        closeId,
        closeNote: payload.note,
      });
      this._pendingSignal = null;
    }

    if (backtest) {
      // Drained in backtest() with correct candle timestamp; no live persistence.
      return;
    }

    // Write-ahead order: persist the deferred _takeProfitSignal BEFORE wiping the
    // pending snapshot — a crash between the writes then leaves both on disk and
    // waitForInit reconciles by id (the reverse order silently lost the position).
    await PERSIST_STRATEGY_FN(this);

    await PersistSignalAdapter.writeSignalData(
      this._pendingSignal,
      symbol,
      this.params.strategyName,
      this.params.exchangeName,
    );
  }

  /**
   * Reports that the pending position's stop-loss order was actually filled on the exchange
   * (e.g. by candle high/low), forcing a close that does not wait for the VWAP-based SL check.
   *
   * The exchange and the strategy are parallel states: ClientStrategy evaluates TP/SL against
   * VWAP, but the real order may close on high/low. This bridges that gap — the broker confirms
   * the fill OUT of the async-hooks execution context, the current pending signal is snapshotted
   * into _stopLossSignal and cleared, and the next tick()/backtest() drains it, closing the
   * position with closeReason "stop_loss" at the effective stop-loss level.
   *
   * No-op if no pending signal exists. Persisted (live mode only) so a crash before the next
   * tick does not lose the deferred close.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param backtest - Whether running in backtest mode
   * @param payload - Optional commit id/note attached to the close
   * @returns Promise that resolves when the stop-loss fill is queued
   */
  public async createStopLoss(symbol: string, backtest: boolean, payload: Partial<CommitPayload>): Promise<void> {
    const closeId = payload.id;
    this.params.logger.debug("ClientStrategy createStopLoss", {
      symbol,
      hasPendingSignal: this._pendingSignal !== null,
      closeId,
    });

    // Snapshot the pending signal for the next tick/backtest to close with reason "stop_loss".
    if (this._pendingSignal) {
      this._stopLossSignal = Object.assign({}, this._pendingSignal, {
        closeId,
        closeNote: payload.note,
      });
      this._pendingSignal = null;
    }

    if (backtest) {
      // Drained in backtest() with correct candle timestamp; no live persistence.
      return;
    }

    // Write-ahead order: persist the deferred _stopLossSignal BEFORE wiping the
    // pending snapshot — a crash between the writes then leaves both on disk and
    // waitForInit reconciles by id (the reverse order silently lost the position).
    await PERSIST_STRATEGY_FN(this);

    await PersistSignalAdapter.writeSignalData(
      this._pendingSignal,
      symbol,
      this.params.strategyName,
      this.params.exchangeName,
    );
  }

  /**
   * Returns the deferred strategy-state snapshot exactly as it would be written to persist on
   * this iteration: the in-memory _userSignal, _commitQueue and deferred user-action flags,
   * plus the current pending signal id.
   *
   * Synchronous in-memory read (no disk access), so it works OUT of the async-hooks context.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @returns The current StrategyData snapshot held in memory
   */
  public async getStatus(symbol: string): Promise<StrategyStatus> {
    this.params.logger.debug("ClientStrategy getStatus", { symbol });
    return {
      pendingSignalId: this._pendingSignal?.id ?? null,
      createdSignal: this._userSignal,
      commitQueue: this._commitQueue,
      closedSignal: this._closedSignal,
      cancelledSignal: this._cancelledSignal,
      activatedSignal: this._activatedSignal,
      takeProfitSignal: this._takeProfitSignal,
      stopLossSignal: this._stopLossSignal,
      retryOpenSignal: this._retryOpenSignal,
      retryOpenCount: this._retryOpenCount,
      retryCloseCount: this._retryCloseCount,
    };
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
    if (!GLOBAL_CONFIG.CC_ENABLE_PPPL_EVERYWHERE) {
      if (this._pendingSignal.position === "long" && currentPrice <= effectivePriceOpen) return false;
      if (this._pendingSignal.position === "short" && currentPrice >= effectivePriceOpen) return false;
    }

    const effectiveTakeProfit = this._pendingSignal._trailingPriceTakeProfit ?? this._pendingSignal.priceTakeProfit;
    if (this._pendingSignal.position === "long" && currentPrice >= effectiveTakeProfit) return false;
    if (this._pendingSignal.position === "short" && currentPrice <= effectiveTakeProfit) return false;

    const { totalClosedPercent, remainingCostBasis } = getTotalClosed(this._pendingSignal);
    const totalInvested = (this._pendingSignal._entry ?? []).reduce((s, e) => s + e.cost, 0) || (this._pendingSignal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST);
    const newPartialDollar = (percentToClose / 100) * remainingCostBasis;
    const newTotalClosedDollar = (totalClosedPercent / 100) * totalInvested + newPartialDollar;
    if (newTotalClosedDollar > totalInvested * PARTIAL_CAP_TOLERANCE_FACTOR) return false;

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
    backtest: boolean,
    timestamp: number
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
    if (!GLOBAL_CONFIG.CC_ENABLE_PPPL_EVERYWHERE) {
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
    const wasExecuted = PARTIAL_PROFIT_FN(this, this._pendingSignal, percentToClose, currentPrice, timestamp);

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
        this.params.symbol,
        TO_PUBLIC_SIGNAL("pending", this._pendingSignal, currentPrice),
        currentPrice,
        new Date(timestamp),
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.symbol,
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

    // Полное закрытие партиалами: остаток базиса неотличим от нуля — позиция
    // экономически закрыта. Маршрутизируем через штатный deferred-close (как
    // closePending): следующий tick/свеча эмитит close-pending + closed/"closed",
    // риск-слот освобождается, а очередь коммитов атрибуцируется снапшоту
    // _closedSignal (см. PROCESS_COMMIT_QUEUE_FN) — сам финальный партиал-коммит
    // не теряется.
    let fullyClosed = false;
    {
      const { remainingCostBasis } = getTotalClosed(this._pendingSignal);
      const totalInvested = (this._pendingSignal._entry ?? []).reduce((s, e) => s + e.cost, 0) || (this._pendingSignal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST);
      if (remainingCostBasis <= totalInvested * PARTIAL_FULL_CLOSE_EPSILON) {
        fullyClosed = true;
        this._closedSignal = Object.assign({}, this._pendingSignal, {
          closeId: undefined as string | undefined,
          closeNote: "full_partial_close",
        });
        this._pendingSignal = null;
      }
    }

    // Persist the queued commit so a crash before the next tick does not lose it
    // (write-ahead: deferred close, если он есть, попадает в этот же снапшот
    // ДО стирания pending ниже)
    await PERSIST_STRATEGY_FN(this);

    if (fullyClosed && !backtest) {
      await PersistSignalAdapter.writeSignalData(
        null,
        this.params.symbol,
        this.params.strategyName,
        this.params.exchangeName,
      );
    }

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
    if (!GLOBAL_CONFIG.CC_ENABLE_PPPL_EVERYWHERE) {
      if (this._pendingSignal.position === "long" && currentPrice >= effectivePriceOpen) return false;
      if (this._pendingSignal.position === "short" && currentPrice <= effectivePriceOpen) return false;
    }

    const effectiveStopLoss = this._pendingSignal._trailingPriceStopLoss ?? this._pendingSignal.priceStopLoss;
    if (this._pendingSignal.position === "long" && currentPrice <= effectiveStopLoss) return false;
    if (this._pendingSignal.position === "short" && currentPrice >= effectiveStopLoss) return false;

    const { totalClosedPercent, remainingCostBasis } = getTotalClosed(this._pendingSignal);
    const totalInvested = (this._pendingSignal._entry ?? []).reduce((s, e) => s + e.cost, 0) || (this._pendingSignal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST);
    const newPartialDollar = (percentToClose / 100) * remainingCostBasis;
    const newTotalClosedDollar = (totalClosedPercent / 100) * totalInvested + newPartialDollar;
    if (newTotalClosedDollar > totalInvested * PARTIAL_CAP_TOLERANCE_FACTOR) return false;

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
    backtest: boolean,
    timestamp: number
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
    if (!GLOBAL_CONFIG.CC_ENABLE_PPPL_EVERYWHERE) {
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
    const wasExecuted = PARTIAL_LOSS_FN(this, this._pendingSignal, percentToClose, currentPrice, timestamp);

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
        this.params.symbol,
        TO_PUBLIC_SIGNAL("pending", this._pendingSignal, currentPrice),
        currentPrice,
        new Date(timestamp),
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.symbol,
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

    // Полное закрытие партиалами: остаток базиса неотличим от нуля — позиция
    // экономически закрыта. Маршрутизируем через штатный deferred-close (как
    // closePending): следующий tick/свеча эмитит close-pending + closed/"closed",
    // риск-слот освобождается, а очередь коммитов атрибуцируется снапшоту
    // _closedSignal (см. PROCESS_COMMIT_QUEUE_FN) — сам финальный партиал-коммит
    // не теряется.
    let fullyClosed = false;
    {
      const { remainingCostBasis } = getTotalClosed(this._pendingSignal);
      const totalInvested = (this._pendingSignal._entry ?? []).reduce((s, e) => s + e.cost, 0) || (this._pendingSignal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST);
      if (remainingCostBasis <= totalInvested * PARTIAL_FULL_CLOSE_EPSILON) {
        fullyClosed = true;
        this._closedSignal = Object.assign({}, this._pendingSignal, {
          closeId: undefined as string | undefined,
          closeNote: "full_partial_close",
        });
        this._pendingSignal = null;
      }
    }

    // Persist the queued commit so a crash before the next tick does not lose it
    // (write-ahead: deferred close, если он есть, попадает в этот же снапшот
    // ДО стирания pending ниже)
    await PERSIST_STRATEGY_FN(this);

    if (fullyClosed && !backtest) {
      await PersistSignalAdapter.writeSignalData(
        null,
        this.params.symbol,
        this.params.strategyName,
        this.params.exchangeName,
      );
    }

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

    // Keep in sync with BREAKEVEN_FN and getBreakeven
    const breakevenThresholdPercent =
      (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2 + GLOBAL_CONFIG.CC_BREAKEVEN_THRESHOLD;

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
    backtest: boolean,
    timestamp: number
  ): Promise<boolean> {
    this.params.logger.debug("ClientStrategy breakeven", {
      symbol,
      currentPrice,
      breakevenThresholdPercent:
        (GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE + GLOBAL_CONFIG.CC_PERCENT_FEE) * 2 + GLOBAL_CONFIG.CC_BREAKEVEN_THRESHOLD,
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
      const publicSignal = TO_PUBLIC_SIGNAL("pending", this._pendingSignal, currentPrice);
      this.params.callbacks.onWrite(
        this.params.symbol,
        publicSignal,
        currentPrice,
        new Date(timestamp),
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.symbol,
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

    // Persist the queued commit so a crash before the next tick does not lose it
    await PERSIST_STRATEGY_FN(this);

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
    // When CC_ENABLE_TRAILING_EVERYWHERE is true, absorption check is skipped
    if (!GLOBAL_CONFIG.CC_ENABLE_TRAILING_EVERYWHERE) {
      const currentTrailingSL = signal._trailingPriceStopLoss;
      if (currentTrailingSL !== undefined) {
        if (signal.position === "long" && newStopLoss <= currentTrailingSL) return false;
        if (signal.position === "short" && newStopLoss >= currentTrailingSL) return false;
      }
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
    backtest: boolean,
    timestamp: number
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
      const publicSignal = TO_PUBLIC_SIGNAL("pending", this._pendingSignal, currentPrice);
      this.params.callbacks.onWrite(
        this.params.symbol,
        publicSignal,
        currentPrice,
        new Date(timestamp),
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.symbol,
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

    // Persist the queued commit so a crash before the next tick does not lose it
    await PERSIST_STRATEGY_FN(this);

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
    // When CC_ENABLE_TRAILING_EVERYWHERE is true, absorption check is skipped
    if (!GLOBAL_CONFIG.CC_ENABLE_TRAILING_EVERYWHERE) {
      const currentTrailingTP = signal._trailingPriceTakeProfit;
      if (currentTrailingTP !== undefined) {
        if (signal.position === "long" && newTakeProfit >= currentTrailingTP) return false;
        if (signal.position === "short" && newTakeProfit <= currentTrailingTP) return false;
      }
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
    backtest: boolean,
    timestamp: number
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
      const publicSignal = TO_PUBLIC_SIGNAL("pending", this._pendingSignal, currentPrice);
      this.params.callbacks.onWrite(
        this.params.symbol,
        publicSignal,
        currentPrice,
        new Date(timestamp),
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.symbol,
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

    // Persist the queued commit so a crash before the next tick does not lose it
    await PERSIST_STRATEGY_FN(this);

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
      ? [{ price: signal.priceOpen, cost: signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST }]
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
   * distance and PNL calculations becomes the cost-weighted harmonic mean of all
   * _entry prices (getEffectivePriceOpen: Σcost / Σ(cost/price), replaying partial
   * closes against the remaining cost basis).
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
    timestamp: number,
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
    const result = AVERAGE_BUY_FN(this, this._pendingSignal, currentPrice, timestamp, cost);

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
        this.params.symbol,
        TO_PUBLIC_SIGNAL("pending", this._pendingSignal, currentPrice),
        currentPrice,
        new Date(timestamp),
        backtest
      );
    }

    if (!backtest) {
      await PersistSignalAdapter.writeSignalData(
        this._pendingSignal,
        this.params.symbol,
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

    // Persist the queued commit so a crash before the next tick does not lose it
    await PERSIST_STRATEGY_FN(this);

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
