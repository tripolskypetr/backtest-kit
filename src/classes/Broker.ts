import { compose, makeExtendable, singleshot } from "functools-kit";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { IStrategyPnL, StrategyCancelReason, StrategyCloseReason, StrategyName } from "../interfaces/Strategy.interface";
import {
  syncSubject,
  syncPendingSubject,
  activePingSubject,
  schedulePingSubject,
  idlePingSubject,
  scheduleEventSubject,
  signalEventSubject,
} from "../config/emitters";
import bt from "../lib";

const BROKER_METHOD_NAME_COMMIT_SIGNAL_OPEN = "BrokerAdapter.commitSignalOpen";
const BROKER_METHOD_NAME_COMMIT_SIGNAL_CLOSE = "BrokerAdapter.commitSignalClose";
const BROKER_METHOD_NAME_COMMIT_SIGNAL_PENDING = "BrokerAdapter.commitSignalPending";
const BROKER_METHOD_NAME_COMMIT_ACTIVE_PING = "BrokerAdapter.commitActivePing";
const BROKER_METHOD_NAME_COMMIT_SCHEDULE_PING = "BrokerAdapter.commitSchedulePing";
const BROKER_METHOD_NAME_COMMIT_IDLE_PING = "BrokerAdapter.commitIdlePing";
const BROKER_METHOD_NAME_COMMIT_SCHEDULE_OPEN = "BrokerAdapter.commitScheduleOpen";
const BROKER_METHOD_NAME_COMMIT_SCHEDULE_CANCELLED = "BrokerAdapter.commitScheduleCancelled";
const BROKER_METHOD_NAME_COMMIT_PENDING_OPEN = "BrokerAdapter.commitPendingOpen";
const BROKER_METHOD_NAME_COMMIT_PENDING_CLOSE = "BrokerAdapter.commitPendingClose";
const BROKER_METHOD_NAME_COMMIT_PARTIAL_PROFIT = "BrokerAdapter.commitPartialProfit";
const BROKER_METHOD_NAME_COMMIT_PARTIAL_LOSS = "BrokerAdapter.commitPartialLoss";
const BROKER_METHOD_NAME_COMMIT_TRAILING_STOP = "BrokerAdapter.commitTrailingStop";
const BROKER_METHOD_NAME_COMMIT_TRAILING_TAKE = "BrokerAdapter.commitTrailingTake";
const BROKER_METHOD_NAME_COMMIT_BREAKEVEN = "BrokerAdapter.commitBreakeven";
const BROKER_METHOD_NAME_COMMIT_AVERAGE_BUY = "BrokerAdapter.commitAverageBuy";
const BROKER_METHOD_NAME_USE_BROKER_ADAPTER = "BrokerAdapter.useBrokerAdapter";
const BROKER_METHOD_NAME_ENABLE = "BrokerAdapter.enable";
const BROKER_METHOD_NAME_DISABLE = "BrokerAdapter.disable";
const BROKER_METHOD_NAME_CLEAR = "BrokerAdapter.clear";

const BROKER_BASE_METHOD_NAME_WAIT_FOR_INIT = "BrokerBase.waitForInit";
const BROKER_BASE_METHOD_NAME_ON_SIGNAL_OPEN = "BrokerBase.onSignalOpenCommit";
const BROKER_BASE_METHOD_NAME_ON_SIGNAL_CLOSE = "BrokerBase.onSignalCloseCommit";
const BROKER_BASE_METHOD_NAME_ON_SIGNAL_PENDING = "BrokerBase.onOrderCheck";
const BROKER_BASE_METHOD_NAME_ON_ACTIVE_PING = "BrokerBase.onSignalActivePing";
const BROKER_BASE_METHOD_NAME_ON_SCHEDULE_PING = "BrokerBase.onSignalSchedulePing";
const BROKER_BASE_METHOD_NAME_ON_IDLE_PING = "BrokerBase.onSignalIdlePing";
const BROKER_BASE_METHOD_NAME_ON_SCHEDULE_OPEN = "BrokerBase.onSignalScheduleOpen";
const BROKER_BASE_METHOD_NAME_ON_SCHEDULE_CANCELLED = "BrokerBase.onSignalScheduleCancelled";
const BROKER_BASE_METHOD_NAME_ON_PENDING_OPEN = "BrokerBase.onSignalPendingOpen";
const BROKER_BASE_METHOD_NAME_ON_PENDING_CLOSE = "BrokerBase.onSignalPendingClose";
const BROKER_BASE_METHOD_NAME_ON_PARTIAL_PROFIT = "BrokerBase.onPartialProfitCommit";
const BROKER_BASE_METHOD_NAME_ON_PARTIAL_LOSS = "BrokerBase.onPartialLossCommit";
const BROKER_BASE_METHOD_NAME_ON_TRAILING_STOP = "BrokerBase.onTrailingStopCommit";
const BROKER_BASE_METHOD_NAME_ON_TRAILING_TAKE = "BrokerBase.onTrailingTakeCommit";
const BROKER_BASE_METHOD_NAME_ON_BREAKEVEN = "BrokerBase.onBreakevenCommit";
const BROKER_BASE_METHOD_NAME_ON_AVERAGE_BUY = "BrokerBase.onAverageBuyCommit";

/**
 * Payload for the signal-open broker event.
 *
 * Emitted automatically via syncSubject when a new pending signal is activated.
 * Forwarded to the registered IBroker adapter via `onSignalOpenCommit`.
 *
 * @example
 * ```typescript
 * const payload: BrokerSignalOpenPayload = {
 *   symbol: "BTCUSDT",
 *   cost: 100,
 *   position: "long",
 *   priceOpen: 50000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerSignalOpenPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) the order belongs to */
  signalId: string;
  /** Dollar cost of the position entry (CC_POSITION_ENTRY_COST) */
  cost: number;
  /** Position direction */
  position: "long" | "short";
  /** Activation price — the price at which the signal became active */
  priceOpen: number;
  /** Original take-profit price from the signal */
  priceTakeProfit: number;
  /** Original stop-loss price from the signal */
  priceStopLoss: number;
  /** Market price at the moment of activation (VWAP or candle average) */
  pnl: IStrategyPnL;
  /** Peak profit achieved during the life of this position up to the moment this public signal was created */
  peakProfit: IStrategyPnL;
  /** Maximum drawdown experienced during the life of this position up to the moment this public signal was created */
  maxDrawdown: IStrategyPnL;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the signal-close broker event.
 *
 * Emitted automatically via syncSubject when a pending signal is closed (SL/TP hit or manual close).
 * Forwarded to the registered IBroker adapter via `onSignalCloseCommit`.
 *
 * @example
 * ```typescript
 * const payload: BrokerSignalClosePayload = {
 *   symbol: "BTCUSDT",
 *   cost: 100,
 *   position: "long",
 *   currentPrice: 54000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   totalEntries: 2,
 *   totalPartials: 1,
 *   pnl: { profit: 80, loss: 0, volume: 100 },
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerSignalClosePayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) the order belongs to */
  signalId: string;
  /** Total dollar cost basis of the position at close */
  cost: number;
  /** Position direction */
  position: "long" | "short";
  /** Market price at the moment of close */
  currentPrice: number;
  /** Effective entry price at time of close (may differ from priceOpen after DCA averaging) */
  priceOpen: number;
  /** Original take-profit price from the signal */
  priceTakeProfit: number;
  /** Original stop-loss price from the signal */
  priceStopLoss: number;
  /** Total number of DCA entries (including initial open) */
  totalEntries: number;
  /** Total number of partial closes executed before final close */
  totalPartials: number;
  /** Realized PnL breakdown for the closed position */
  pnl: IStrategyPnL;
  /** Peak profit achieved during the life of this position up to the moment this public signal was created */
  peakProfit: IStrategyPnL;
  /** Maximum drawdown experienced during the life of this position up to the moment this public signal was created */
  maxDrawdown: IStrategyPnL;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the order synchronization broker event.
 *
 * Emitted automatically via syncPendingSubject on every live tick while a signal is monitored,
 * BEFORE the framework evaluates completion. Forwarded to the registered IBroker adapter via
 * `onOrderCheck`. Fires for BOTH monitored states, discriminated by `type`:
 * - `type: "active"` — pending signal (open position), before TP/SL/time evaluation;
 * - `type: "schedule"` — scheduled signal, before timeout/price-activation evaluation
 *   (the order in question is the resting entry order).
 *
 * The adapter should query the exchange by `signalId` and THROW ONLY when the order is
 * definitively NOT FOUND by that id (filled, cancelled, or liquidated externally). A throw
 * propagates to CREATE_SYNC_PENDING_FN, which makes the framework close the pending signal with
 * closeReason "closed" (type "active") or cancel the scheduled signal with reason "user"
 * (type "schedule"). Returning normally keeps the signal under normal monitoring.
 *
 * NOTE for type "schedule": if the resting entry order actually FILLED, confirm the fill via
 * `commitActivateScheduled` instead of throwing — a throw here is a terminal cancel, not an
 * activation.
 *
 * CRITICAL: transient/network errors (timeout, 5xx, rate limit, disconnect) must be SWALLOWED —
 * return normally instead of throwing. A thrown network error would wrongly close an open
 * position. Only a confirmed "order not found by id" response is a valid reason to throw.
 *
 * @example
 * ```typescript
 * const payload: BrokerSignalPendingPayload = {
 *   symbol: "BTCUSDT",
 *   position: "long",
 *   currentPrice: 50500,
 *   priceOpen: 50000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerSignalPendingPayload = {
  /** Monitored state: "active" — open position order, "schedule" — resting entry order */
  type: "schedule" | "active";
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) the order belongs to */
  signalId: string;
  /** Position direction */
  position: "long" | "short";
  /** Market price at the moment of the ping */
  currentPrice: number;
  /** Effective entry price (may differ from priceOpen after DCA averaging) */
  priceOpen: number;
  /** Effective take-profit price at the moment of the ping */
  priceTakeProfit: number;
  /** Effective stop-loss price at the moment of the ping */
  priceStopLoss: number;
  /** Unrealized PnL of the open position at the moment of the ping */
  pnl: IStrategyPnL;
  /** Peak profit achieved during the life of this position up to this event */
  peakProfit: IStrategyPnL;
  /** Maximum drawdown experienced during the life of this position up to this event */
  maxDrawdown: IStrategyPnL;
  /** Total number of DCA entries (including initial open) */
  totalEntries: number;
  /** Total number of partial closes executed */
  totalPartials: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the active-ping broker event.
 *
 * Emitted automatically via activePingSubject on every live tick while a pending (open) signal is
 * monitored. Forwarded to the registered IBroker adapter via `onSignalActivePing`. Purely
 * informational — unlike `onOrderCheck` a throw here does NOT close the position.
 *
 * @example
 * ```typescript
 * const payload: BrokerActivePingPayload = {
 *   symbol: "BTCUSDT",
 *   position: "long",
 *   currentPrice: 50500,
 *   priceOpen: 50000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerActivePingPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) of the monitored position */
  signalId: string;
  /** Position direction */
  position: "long" | "short";
  /** Market price at the moment of the ping */
  currentPrice: number;
  /** Effective entry price (may differ from priceOpen after DCA averaging) */
  priceOpen: number;
  /** Effective take-profit price at the moment of the ping */
  priceTakeProfit: number;
  /** Effective stop-loss price at the moment of the ping */
  priceStopLoss: number;
  /** Unrealized PnL of the open position at the moment of the ping */
  pnl: IStrategyPnL;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the schedule-ping broker event.
 *
 * Emitted automatically via schedulePingSubject on every live tick while a scheduled signal is
 * monitored (waiting for priceOpen activation). Forwarded to the registered IBroker adapter via
 * `onSignalSchedulePing`. Purely informational.
 *
 * @example
 * ```typescript
 * const payload: BrokerSchedulePingPayload = {
 *   symbol: "BTCUSDT",
 *   position: "long",
 *   currentPrice: 49800,
 *   priceOpen: 50000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerSchedulePingPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) of the scheduled signal */
  signalId: string;
  /** Position direction */
  position: "long" | "short";
  /** Market price at the moment of the ping */
  currentPrice: number;
  /** Pending entry price the scheduled signal is waiting for */
  priceOpen: number;
  /** Take-profit price configured for the scheduled signal */
  priceTakeProfit: number;
  /** Stop-loss price configured for the scheduled signal */
  priceStopLoss: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the idle-ping broker event.
 *
 * Emitted automatically via idlePingSubject on every live tick while the strategy has no pending or
 * scheduled signal. Forwarded to the registered IBroker adapter via `onSignalIdlePing`. Purely
 * informational — carries no signal because none is active.
 *
 * @example
 * ```typescript
 * const payload: BrokerIdlePingPayload = {
 *   symbol: "BTCUSDT",
 *   currentPrice: 50500,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerIdlePingPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Market price at the moment of the ping */
  currentPrice: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the scheduled-signal-open broker event.
 *
 * Emitted automatically via scheduleEventSubject (action "scheduled") when a new scheduled signal is
 * created and starts waiting for priceOpen activation. Forwarded to the registered IBroker adapter
 * via `onSignalScheduleOpen`. The scheduled -> active transition is NOT reported here — activation
 * arrives through `onSignalOpenCommit`.
 *
 * @example
 * ```typescript
 * const payload: BrokerScheduleOpenPayload = {
 *   symbol: "BTCUSDT",
 *   position: "long",
 *   currentPrice: 49800,
 *   priceOpen: 50000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerScheduleOpenPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) of the scheduled signal */
  signalId: string;
  /** Position direction */
  position: "long" | "short";
  /** Market price at the moment the scheduled signal was created */
  currentPrice: number;
  /** Pending entry price the scheduled signal waits for */
  priceOpen: number;
  /** Take-profit price configured for the scheduled signal */
  priceTakeProfit: number;
  /** Stop-loss price configured for the scheduled signal */
  priceStopLoss: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the scheduled-signal-cancelled broker event.
 *
 * Emitted automatically via scheduleEventSubject (action "cancelled") when a scheduled signal is
 * removed before it ever activated. Forwarded to the registered IBroker adapter via
 * `onSignalScheduleCancelled`. The `reason` distinguishes timeout / price reject / user cancel.
 *
 * @example
 * ```typescript
 * const payload: BrokerScheduleCancelledPayload = {
 *   symbol: "BTCUSDT",
 *   position: "long",
 *   currentPrice: 47500,
 *   priceOpen: 50000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   reason: "price_reject",
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerScheduleCancelledPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) of the cancelled scheduled signal */
  signalId: string;
  /** Position direction */
  position: "long" | "short";
  /** Market price at the moment of cancellation */
  currentPrice: number;
  /** Pending entry price the scheduled signal had been waiting for */
  priceOpen: number;
  /** Take-profit price that had been configured for the scheduled signal */
  priceTakeProfit: number;
  /** Stop-loss price that had been configured for the scheduled signal */
  priceStopLoss: number;
  /** Why the scheduled signal was cancelled: "timeout" / "price_reject" / "user" */
  reason?: StrategyCancelReason;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the pending-signal-open broker event.
 *
 * Emitted automatically via signalEventSubject (action "opened") when a pending position is opened
 * (new signal / immediate entry / scheduled or user activation). Forwarded to the registered IBroker
 * adapter via `onSignalPendingOpen`.
 *
 * @example
 * ```typescript
 * const payload: BrokerPendingOpenPayload = {
 *   symbol: "BTCUSDT",
 *   position: "long",
 *   currentPrice: 50000,
 *   priceOpen: 50000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerPendingOpenPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) of the opened position */
  signalId: string;
  /** Position direction */
  position: "long" | "short";
  /** Effective entry price at the moment the position opened */
  currentPrice: number;
  /** Effective entry price (may differ from currentPrice after DCA averaging) */
  priceOpen: number;
  /** Take-profit price configured for the position */
  priceTakeProfit: number;
  /** Stop-loss price configured for the position */
  priceStopLoss: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for the pending-signal-close broker event.
 *
 * Emitted automatically via signalEventSubject (action "closed") when a pending position is closed.
 * Forwarded to the registered IBroker adapter via `onSignalPendingClose`. The `closeReason`
 * distinguishes take_profit / stop_loss / time_expired / user-close / broker fill / order gone.
 *
 * @example
 * ```typescript
 * const payload: BrokerPendingClosePayload = {
 *   symbol: "BTCUSDT",
 *   position: "long",
 *   currentPrice: 55000,
 *   priceOpen: 50000,
 *   priceTakeProfit: 55000,
 *   priceStopLoss: 48000,
 *   closeReason: "take_profit",
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerPendingClosePayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) of the closed position */
  signalId: string;
  /** Position direction */
  position: "long" | "short";
  /** Market price at the moment of close */
  currentPrice: number;
  /** Effective entry price of the closed position */
  priceOpen: number;
  /** Effective take-profit price of the closed position */
  priceTakeProfit: number;
  /** Effective stop-loss price of the closed position */
  priceStopLoss: number;
  /** Why the position closed: "take_profit" / "stop_loss" / "time_expired" / "closed" */
  closeReason?: StrategyCloseReason;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a partial-profit close broker event.
 *
 * Forwarded to the registered IBroker adapter via `onPartialProfitCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.partialProfit()`.
 *
 * @example
 * ```typescript
 * const payload: BrokerPartialProfitPayload = {
 *   symbol: "BTCUSDT",
 *   percentToClose: 30,
 *   cost: 30,
 *   currentPrice: 52000,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerPartialProfitPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) the order belongs to */
  signalId: string;
  /** Percentage of the position to close (0–100) */
  percentToClose: number;
  /** Dollar value of the portion being closed */
  cost: number;
  /** Current market price at which the partial close executes */
  currentPrice: number;
  /** Position direction */
  position: "long" | "short";
  /** Active take profit price at the time of the partial close */
  priceTakeProfit: number;
  /** Active stop loss price at the time of the partial close */
  priceStopLoss: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a partial-loss close broker event.
 *
 * Forwarded to the registered IBroker adapter via `onPartialLossCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.partialLoss()`.
 *
 * @example
 * ```typescript
 * const payload: BrokerPartialLossPayload = {
 *   symbol: "BTCUSDT",
 *   percentToClose: 40,
 *   cost: 40,
 *   currentPrice: 48500,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerPartialLossPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) the order belongs to */
  signalId: string;
  /** Percentage of the position to close (0–100) */
  percentToClose: number;
  /** Dollar value of the portion being closed */
  cost: number;
  /** Current market price at which the partial close executes */
  currentPrice: number;
  /** Position direction */
  position: "long" | "short";
  /** Active take profit price at the time of the partial close */
  priceTakeProfit: number;
  /** Active stop loss price at the time of the partial close */
  priceStopLoss: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a trailing stop-loss update broker event.
 *
 * Forwarded to the registered IBroker adapter via `onTrailingStopCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.trailingStop()`.
 * `newStopLossPrice` is the absolute SL price computed from percentShift + original SL + effectivePriceOpen.
 *
 * @example
 * ```typescript
 * // LONG: entry=100, originalSL=90, percentShift=-5 → newSL=95
 * const payload: BrokerTrailingStopPayload = {
 *   symbol: "BTCUSDT",
 *   percentShift: -5,
 *   currentPrice: 102,
 *   newStopLossPrice: 95,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerTrailingStopPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) the order belongs to */
  signalId: string;
  /** Percentage shift applied to the ORIGINAL SL distance (-100 to 100) */
  percentShift: number;
  /** Current market price used for intrusion validation */
  currentPrice: number;
  /** Absolute stop-loss price after applying percentShift */
  newStopLossPrice: number;
  /** Active take profit price at the time of the trailing update */
  takeProfitPrice: number;
  /** Position direction */
  position: "long" | "short";
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a trailing take-profit update broker event.
 *
 * Forwarded to the registered IBroker adapter via `onTrailingTakeCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.trailingTake()`.
 * `newTakeProfitPrice` is the absolute TP price computed from percentShift + original TP + effectivePriceOpen.
 *
 * @example
 * ```typescript
 * // LONG: entry=100, originalTP=110, percentShift=-3 → newTP=107
 * const payload: BrokerTrailingTakePayload = {
 *   symbol: "BTCUSDT",
 *   percentShift: -3,
 *   currentPrice: 102,
 *   newTakeProfitPrice: 107,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerTrailingTakePayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) the order belongs to */
  signalId: string;
  /** Percentage shift applied to the ORIGINAL TP distance (-100 to 100) */
  percentShift: number;
  /** Current market price used for intrusion validation */
  currentPrice: number;
  /** Absolute take-profit price after applying percentShift */
  newTakeProfitPrice: number;
  /** Active take profit price at the time of the trailing update */
  takeProfitPrice: number;
  /** Position direction */
  position: "long" | "short";
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a breakeven operation broker event.
 *
 * Forwarded to the registered IBroker adapter via `onBreakevenCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.breakeven()`.
 * `newStopLossPrice` equals `effectivePriceOpen` (entry price).
 * `newTakeProfitPrice` equals `_trailingPriceTakeProfit ?? priceTakeProfit` (TP is unchanged).
 *
 * @example
 * ```typescript
 * // LONG: entry=100, currentPrice=100.5, newSL=100 (entry), newTP=110 (unchanged)
 * const payload: BrokerBreakevenPayload = {
 *   symbol: "BTCUSDT",
 *   currentPrice: 100.5,
 *   newStopLossPrice: 100,
 *   newTakeProfitPrice: 110,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerBreakevenPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) the order belongs to */
  signalId: string;
  /** Current market price at the moment breakeven is triggered */
  currentPrice: number;
  /** New stop-loss price = effectivePriceOpen (the position's effective entry price) */
  newStopLossPrice: number;
  /** Effective take-profit price = _trailingPriceTakeProfit ?? priceTakeProfit (unchanged by breakeven) */
  newTakeProfitPrice: number;
  /** Position direction */
  position: "long" | "short";
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Payload for a DCA average-buy entry broker event.
 *
 * Forwarded to the registered IBroker adapter via `onAverageBuyCommit`.
 * Called explicitly after all validations pass, before `strategyCoreService.averageBuy()`.
 * `currentPrice` is the market price at which the new DCA entry is added.
 *
 * @example
 * ```typescript
 * const payload: BrokerAverageBuyPayload = {
 *   symbol: "BTCUSDT",
 *   currentPrice: 42000,
 *   cost: 100,
 *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
 *   backtest: false,
 * };
 * ```
 */
export type BrokerAverageBuyPayload = {
  /** Trading pair symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Unique signal identifier (UUID v4) the order belongs to */
  signalId: string;
  /** Market price at which the DCA entry is placed */
  currentPrice: number;
  /** Dollar amount of the new DCA entry (default: CC_POSITION_ENTRY_COST) */
  cost: number;
  /** Position direction */
  position: "long" | "short";
  /** Active take profit price at the time of the DCA entry */
  priceTakeProfit: number;
  /** Active stop loss price at the time of the DCA entry */
  priceStopLoss: number;
  /** Strategy/exchange/frame routing context */
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  /** true when called during a backtest run — adapter should skip exchange calls */
  backtest: boolean;
};

/**
 * Broker adapter interface for live order execution.
 *
 * Implement this interface to connect the framework to a real exchange or broker.
 * All methods are called BEFORE the corresponding DI-core state mutation, so if any
 * method throws, the internal state remains unchanged (transaction semantics).
 *
 * In backtest mode all calls are silently skipped by BrokerAdapter — the adapter
 * never receives backtest traffic.
 *
 * @example
 * ```typescript
 * class MyBroker implements IBroker {
 *   async waitForInit() {
 *     await this.exchange.connect();
 *   }
 *   async onSignalOpenCommit(payload) {
 *     await this.exchange.placeOrder({ symbol: payload.symbol, side: payload.position });
 *   }
 *   // ... other methods
 * }
 *
 * Broker.useBrokerAdapter(MyBroker);
 * ```
 */
export interface IBroker {
  /** Called once before first use. Connect to exchange, load credentials, etc. */
  waitForInit(): Promise<void>;

  /**
   * Called when a signal is being closed (take-profit, stop-loss, or manual close). Emitted via
   * syncSubject BEFORE the framework mutates strategy state, so it is also the close **gate**.
   *
   * MANUAL WIRING — EXCEPTION-BASED: place the real exit order here (tag/look up by `payload.signalId`)
   * and record final PnL. This is the confirmed-close commit; like `onOrderSync` (signal-close) it
   * shares the gate semantics — a THROW means "the exchange did not close the position" and the
   * framework SKIPS the close, leaving the position open and retrying on the next tick. Return
   * normally to let the close proceed. Backtest short-circuits this (no live exchange), so the gate is
   * live-only.
   *
   * This differs from `onSignalPendingClose`, which is the informational lifecycle hook that fires
   * AFTER the close is committed (and cannot veto it).
   */
  onSignalCloseCommit(payload: BrokerSignalClosePayload): Promise<void>;

  /**
   * Called when a signal is being opened (position entry). Emitted via syncSubject BEFORE the
   * framework mutates strategy state, so it is also the open **gate**.
   *
   * MANUAL WIRING — EXCEPTION-BASED: place the real entry order here (tag the exchange order with
   * `payload.signalId` so later `onOrderCheck` / `onSignalActivePing` can find it). Like `onOrderSync`
   * (signal-open) it shares the gate semantics — a THROW means "the exchange did not fill the entry"
   * (e.g. limit order rejected) and the framework ROLLS BACK the open: the pending signal returns to
   * idle (a scheduled activation is cancelled) and is retried on the next tick. Return normally to let
   * the open proceed. Also the point where a scheduled signal's activation surfaces. Backtest
   * short-circuits this, so the gate is live-only.
   *
   * This differs from `onSignalPendingOpen`, which is the informational lifecycle hook that fires
   * AFTER the open is committed (and cannot veto it).
   */
  onSignalOpenCommit(payload: BrokerSignalOpenPayload): Promise<void>;

  /**
   * Called on every live tick while a signal is monitored, BEFORE completion evaluation.
   * Fires for both monitored states, discriminated by `payload.type`:
   * - "active" — pending signal (open position), before TP/SL/time evaluation;
   * - "schedule" — scheduled signal (resting entry order), before timeout/price-activation.
   *
   * Query the exchange by `payload.signalId` and THROW ONLY when the order is NOT FOUND by that id
   * — the framework will then close the position with closeReason "closed" (type "active") or
   * cancel the scheduled signal with reason "user" (type "schedule"). Return normally to keep
   * monitoring. For type "schedule": a filled resting order must be confirmed via
   * `commitActivateScheduled`, not by throwing here (a throw is a terminal cancel).
   *
   * CRITICAL: swallow transient/network errors (timeout, 5xx, rate limit, disconnect) — return
   * normally instead of throwing, otherwise a connectivity blip would wrongly close an open
   * position. Throw exclusively on a confirmed "order not found by id" result.
   *
   * Manual wiring — EXCEPTION-BASED VARIANT
   *
   * This is the throw-driven **alternative** to the imperative commit-function wiring in
   * `onSignalActivePing`:
   * - **Exception-based (here):** THROW → framework closes the position with closeReason "closed".
   *   One binary gate, no reason distinction. Good when "order gone" is the only condition you handle.
   * - **Imperative (`onSignalActivePing` + `src/function/strategy.ts`):** call
   *   `commitClosePending` / `commitCreateTakeProfit` / `commitCreateStopLoss` to close with the
   *   correct reason and handle TP vs SL vs no-counterparty separately.
   *
   * Pick ONE per condition — do not both throw here AND `commitClosePending` in the active-ping for
   * the same "order gone" event.
   *
   * @example
   * ```typescript
   * async onOrderCheck(payload: BrokerSignalPendingPayload) {
   *   let order: Order | null;
   *   try {
   *     order = await this.exchange.getOrderById(payload.signalId);
   *   } catch (networkError) {
   *     return; // transient — keep the position open, retry next tick
   *   }
   *   if (!order) {
   *     throw new Error(`Order ${payload.signalId} not found`); // confirmed gone -> close "closed"
   *   }
   * }
   * ```
   */
  onOrderCheck(payload: BrokerSignalPendingPayload): Promise<void>;

  /**
   * Called on every live tick while a pending (open) signal is monitored.
   * Purely informational mirror of the active-ping lifecycle — a throw here does NOT close the
   * position (unlike `onOrderCheck`).
   *
   * Manual wiring — EVENT-BASED (driving an open position from real exchange state)
   *
   * Primary per-tick **event-based** hook for an open position (a throw does NOT close it — react to
   * the event and decide imperatively). This is where you reconcile the framework's VWAP view with
   * real fills: catch a **SL that gapped through** the level, or a **TP that filled before VWAP**
   * reached it. Poll your real order and translate its state into strategy state via the
   * commit-functions from `src/function/strategy.ts` (callable here because the ping is emitted inside
   * the strategy tick; effects are deferred to the next tick):
   * - `commitCreateTakeProfit(symbol, { id })` — real TP order filled (possibly before VWAP reached
   *   the level) → force close, reason "take_profit".
   * - `commitCreateStopLoss(symbol, { id })` — real SL order filled (e.g. price gapped through SL) →
   *   force close, reason "stop_loss".
   * - `commitClosePending(symbol, { id })` — no counterparty (no buyer/seller, liquidity gap) → close
   *   now with reason "closed", instead of throwing.
   *
   * @example
   * ```typescript
   * import { commitCreateTakeProfit, commitCreateStopLoss, commitClosePending } from "backtest-kit";
   *
   * async onSignalActivePing(payload: BrokerActivePingPayload) {
   *   const order = await this.exchange.getOrderById(payload.signalId);
   *   if (order?.status === "filled" && order.kind === "take_profit") {
   *     await commitCreateTakeProfit(payload.symbol, { id: order.id });
   *   } else if (order?.status === "filled" && order.kind === "stop_loss") {
   *     await commitCreateStopLoss(payload.symbol, { id: order.id });
   *   } else if (order?.status === "no_counterparty") {
   *     await commitClosePending(payload.symbol, { id: order.id });
   *   }
   * }
   * ```
   */
  onSignalActivePing(payload: BrokerActivePingPayload): Promise<void>;

  /**
   * Called on every live tick while a scheduled signal is monitored (waiting for priceOpen
   * activation). Purely informational.
   *
   * Manual wiring — EVENT-BASED (driving the scheduled phase from real exchange state)
   *
   * Per-tick **event-based** hook (a throw does NOT veto anything — react and decide imperatively).
   * Poll your real resting/limit order and translate it via the commit-functions from
   * `src/function/strategy.ts` (deferred to the next tick):
   * - `commitActivateScheduled(symbol, { id })` — resting order filled/resolved → activate now,
   *   without waiting for VWAP to reach priceOpen (surfaces as `onSignalOpenCommit` next tick).
   * - `commitCancelScheduled(symbol, { id })` — resting order cancelled/rejected externally → drop it.
   *
   * @example
   * ```typescript
   * import { commitActivateScheduled, commitCancelScheduled } from "backtest-kit";
   *
   * async onSignalSchedulePing(payload: BrokerSchedulePingPayload) {
   *   const order = await this.exchange.getOrderById(payload.signalId);
   *   if (order?.status === "filled" || order?.status === "resolved") {
   *     await commitActivateScheduled(payload.symbol, { id: order.id });
   *   } else if (order?.status === "cancelled" || order?.status === "rejected") {
   *     await commitCancelScheduled(payload.symbol, { id: order.id });
   *   }
   * }
   * ```
   */
  onSignalSchedulePing(payload: BrokerSchedulePingPayload): Promise<void>;

  /**
   * Called on every live tick while the strategy is idle (no pending or scheduled signal).
   * Purely informational.
   *
   * MANUAL WIRING — EVENT-BASED: no signal is active, so there is nothing to commit; use it for idle
   * heartbeats / housekeeping. A throw does not affect strategy state.
   */
  onSignalIdlePing(payload: BrokerIdlePingPayload): Promise<void>;

  /**
   * Called when a new scheduled signal is created and starts waiting for priceOpen activation.
   * The scheduled -> active transition is reported via `onSignalOpenCommit`, not here.
   *
   * Manual wiring — EVENT-BASED (placing the resting order)
   *
   * Fires ONCE at creation — place the real resting/limit order (tag it with `payload.signalId` so
   * `onSignalSchedulePing` can poll it later). If it resolves immediately, promote it with
   * `commitActivateScheduled(symbol, { id })`; if rejected, drop it with
   * `commitCancelScheduled(symbol, { id })`. Use `onSignalSchedulePing` for ongoing polling.
   *
   * @example
   * ```typescript
   * import { commitActivateScheduled, commitCancelScheduled } from "backtest-kit";
   *
   * async onSignalScheduleOpen(payload: BrokerScheduleOpenPayload) {
   *   const order = await this.exchange.placeLimitOrder({
   *     id: payload.signalId,
   *     symbol: payload.symbol,
   *     side: payload.position,
   *     price: payload.priceOpen,
   *   });
   *   if (order.status === "filled") await commitActivateScheduled(payload.symbol, { id: order.id });
   *   else if (order.status === "rejected") await commitCancelScheduled(payload.symbol, { id: order.id });
   * }
   * ```
   */
  onSignalScheduleOpen(payload: BrokerScheduleOpenPayload): Promise<void>;

  /**
   * Called when a scheduled signal is cancelled before it ever activated
   * (reason: timeout / price_reject / user).
   *
   * Manual wiring — EVENT-BASED (tearing down the resting order)
   *
   * Outbound side — the framework has already dropped the scheduled signal, so there is nothing to
   * `commitCancelScheduled` here; instead cancel the real resting order you placed in
   * `onSignalScheduleOpen` (look it up by `payload.signalId`). `payload.reason` tells you why.
   *
   * @example
   * ```typescript
   * async onSignalScheduleCancelled(payload: BrokerScheduleCancelledPayload) {
   *   await this.exchange.cancelOrderById(payload.signalId);
   * }
   * ```
   */
  onSignalScheduleCancelled(payload: BrokerScheduleCancelledPayload): Promise<void>;

  /**
   * Called when a pending position is opened (new signal / immediate / scheduled or user
   * activation). Purely informational lifecycle hook for the active phase of a signal.
   *
   * Manual wiring — EVENT-BASED (placing entry + protective orders)
   *
   * Fires ONCE at open — place the real entry confirmation and protective TP/SL orders (tag them with
   * `payload.signalId`). Drive the rest per-tick from `onSignalActivePing`. This hook does not gate
   * the position; for a true entry gate use `onOrderSync` (signal-open).
   */
  onSignalPendingOpen(payload: BrokerPendingOpenPayload): Promise<void>;

  /**
   * Called when a pending position is closed
   * (reason: take_profit / stop_loss / time_expired / closed).
   *
   * Manual wiring — EVENT-BASED (tearing down the position)
   *
   * Outbound side — the framework has already removed the pending signal, so there is nothing to
   * `commitClosePending` here; instead flatten the real position and cancel leftover TP/SL orders by
   * `payload.signalId`, and record final PnL. `payload.closeReason` says which path closed it. If you
   * need to FORCE the close yourself (e.g. no counterparty), do it earlier in `onSignalActivePing`.
   *
   * @example
   * ```typescript
   * async onSignalPendingClose(payload: BrokerPendingClosePayload) {
   *   await this.exchange.flatten(payload.symbol);
   *   await this.exchange.cancelProtectiveOrders(payload.signalId);
   * }
   * ```
   */
  onSignalPendingClose(payload: BrokerPendingClosePayload): Promise<void>;

  /** Called when a partial profit close is committed. */
  onPartialProfitCommit(payload: BrokerPartialProfitPayload): Promise<void>;

  /** Called when a partial loss close is committed. */
  onPartialLossCommit(payload: BrokerPartialLossPayload): Promise<void>;

  /** Called when a trailing stop update is committed. */
  onTrailingStopCommit(payload: BrokerTrailingStopPayload): Promise<void>;

  /** Called when a trailing take-profit update is committed. */
  onTrailingTakeCommit(payload: BrokerTrailingTakePayload): Promise<void>;

  /** Called when a breakeven stop is committed (stop loss moved to entry price). */
  onBreakevenCommit(payload: BrokerBreakevenPayload): Promise<void>;

  /** Called when a DCA (average-buy) entry is committed. */
  onAverageBuyCommit(payload: BrokerAverageBuyPayload): Promise<void>;
}

/**
 * Constructor type for a broker adapter class.
 *
 * Used by `BrokerAdapter.useBrokerAdapter` to accept a class (not an instance).
 * All `IBroker` methods are optional — implement only what the adapter needs.
 *
 * @example
 * ```typescript
 * class MyBroker implements Partial<IBroker> {
 *   async onSignalOpenCommit(payload: BrokerSignalOpenPayload) { ... }
 * }
 *
 * Broker.useBrokerAdapter(MyBroker); // MyBroker satisfies TBrokerCtor
 * ```
 */
export type TBrokerCtor = new () => Partial<IBroker>;

/**
 * Wrapper around a `Partial<IBroker>` adapter instance.
 *
 * Implements the full `IBroker` interface but guards every method call —
 * if the underlying adapter does not implement a given method, an error is thrown.
 * `waitForInit` is the only exception: it is silently skipped when not implemented.
 *
 * Created internally by `BrokerAdapter.useBrokerAdapter` and stored as
 * `_brokerInstance`. All `BrokerAdapter.commit*` methods delegate here
 * after backtest-mode and enable-state checks pass.
 */
export class BrokerProxy implements IBroker {
  constructor(readonly _instance: Partial<IBroker>) {}

  /**
   * Calls `waitForInit` on the underlying adapter exactly once (singleshot).
   * If the adapter does not implement `waitForInit`, the call is silently skipped.
   *
   * @returns Resolves when initialization is complete (or immediately if not implemented).
   */
  public waitForInit = singleshot(async (): Promise<void> => {
    if (this._instance.waitForInit) {
      await this._instance.waitForInit();
      return;
    }
  });

  /**
   * Forwards a signal-open event to the underlying adapter.
   * Silently skipped (with a warning log) when the adapter does not implement `onSignalOpenCommit`.
   *
   * @param payload - Signal open details: symbol, cost, position, prices, context, backtest flag.
   */
  public async onSignalOpenCommit(
    payload: BrokerSignalOpenPayload,
  ): Promise<void> {
    if (this._instance.onSignalOpenCommit) {
      await this.waitForInit();
      await this._instance.onSignalOpenCommit(payload);
      return;
    }
    // TBrokerCtor documents every IBroker method as optional. Returning
    // normally means "allow" under the gate semantics: an adapter that
    // implements only informational hooks must not veto opens/closes
    // (a throw here would be treated as a broker rejection and retried
    // forever, silently blocking all trading).
    bt.loggerService.warn(
      "BrokerProxy onSignalOpenCommit is not implemented by the adapter, skipping",
      { symbol: payload.symbol, context: payload.context },
    );
  }

  /**
   * Forwards a pending-order ping to the underlying adapter.
   *
   * If the adapter does not implement `onOrderCheck`, the call is silently skipped
   * (the order is assumed still open). When implemented, exceptions propagate — a throw means
   * the order was NOT FOUND by `payload.signalId` and the framework closes the position with
   * closeReason "closed". The adapter must throw ONLY on a confirmed "order not found by id"
   * result and SWALLOW transient/network errors (return normally), otherwise a connectivity blip
   * would wrongly close an open position.
   *
   * @param payload - Pending ping details: symbol, signalId, position, prices, pnl, context, backtest flag.
   */
  public async onOrderCheck(
    payload: BrokerSignalPendingPayload,
  ): Promise<void> {
    if (this._instance.onOrderCheck) {
      await this.waitForInit();
      await this._instance.onOrderCheck(payload);
      return;
    }
  }

  /**
   * Forwards an active-ping event to the underlying adapter.
   * Silently skipped when the adapter does not implement `onSignalActivePing`.
   *
   * @param payload - Active ping details: symbol, signalId, position, prices, pnl, context, backtest.
   */
  public async onSignalActivePing(
    payload: BrokerActivePingPayload,
  ): Promise<void> {
    if (this._instance.onSignalActivePing) {
      await this.waitForInit();
      await this._instance.onSignalActivePing(payload);
      return;
    }
  }

  /**
   * Forwards a schedule-ping event to the underlying adapter.
   * Silently skipped when the adapter does not implement `onSignalSchedulePing`.
   *
   * @param payload - Schedule ping details: symbol, signalId, position, prices, context, backtest.
   */
  public async onSignalSchedulePing(
    payload: BrokerSchedulePingPayload,
  ): Promise<void> {
    if (this._instance.onSignalSchedulePing) {
      await this.waitForInit();
      await this._instance.onSignalSchedulePing(payload);
      return;
    }
  }

  /**
   * Forwards an idle-ping event to the underlying adapter.
   * Silently skipped when the adapter does not implement `onSignalIdlePing`.
   *
   * @param payload - Idle ping details: symbol, currentPrice, context, backtest.
   */
  public async onSignalIdlePing(
    payload: BrokerIdlePingPayload,
  ): Promise<void> {
    if (this._instance.onSignalIdlePing) {
      await this.waitForInit();
      await this._instance.onSignalIdlePing(payload);
      return;
    }
  }

  /**
   * Forwards a scheduled-signal-open event to the underlying adapter.
   * Silently skipped when the adapter does not implement `onSignalScheduleOpen`.
   *
   * @param payload - Scheduled open details: symbol, signalId, position, prices, context, backtest.
   */
  public async onSignalScheduleOpen(
    payload: BrokerScheduleOpenPayload,
  ): Promise<void> {
    if (this._instance.onSignalScheduleOpen) {
      await this.waitForInit();
      await this._instance.onSignalScheduleOpen(payload);
      return;
    }
  }

  /**
   * Forwards a scheduled-signal-cancelled event to the underlying adapter.
   * Silently skipped when the adapter does not implement `onSignalScheduleCancelled`.
   *
   * @param payload - Scheduled cancel details: symbol, signalId, position, prices, reason, context, backtest.
   */
  public async onSignalScheduleCancelled(
    payload: BrokerScheduleCancelledPayload,
  ): Promise<void> {
    if (this._instance.onSignalScheduleCancelled) {
      await this.waitForInit();
      await this._instance.onSignalScheduleCancelled(payload);
      return;
    }
  }

  /**
   * Forwards a pending-signal-open event to the underlying adapter.
   * Silently skipped when the adapter does not implement `onSignalPendingOpen`.
   *
   * @param payload - Pending open details: symbol, signalId, position, prices, context, backtest.
   */
  public async onSignalPendingOpen(
    payload: BrokerPendingOpenPayload,
  ): Promise<void> {
    if (this._instance.onSignalPendingOpen) {
      await this.waitForInit();
      await this._instance.onSignalPendingOpen(payload);
      return;
    }
  }

  /**
   * Forwards a pending-signal-close event to the underlying adapter.
   * Silently skipped when the adapter does not implement `onSignalPendingClose`.
   *
   * @param payload - Pending close details: symbol, signalId, position, prices, closeReason, context, backtest.
   */
  public async onSignalPendingClose(
    payload: BrokerPendingClosePayload,
  ): Promise<void> {
    if (this._instance.onSignalPendingClose) {
      await this.waitForInit();
      await this._instance.onSignalPendingClose(payload);
      return;
    }
  }

  /**
   * Forwards a signal-close event to the underlying adapter.
   * Silently skipped (with a warning log) when the adapter does not implement `onSignalCloseCommit`.
   *
   * @param payload - Signal close details: symbol, cost, position, currentPrice, pnl, context, backtest flag.
   */
  public async onSignalCloseCommit(
    payload: BrokerSignalClosePayload,
  ): Promise<void> {
    if (this._instance.onSignalCloseCommit) {
      await this.waitForInit();
      await this._instance.onSignalCloseCommit(payload);
      return;
    }
    // TBrokerCtor documents every IBroker method as optional. Returning
    // normally means "allow" under the gate semantics: an adapter that
    // implements only informational hooks must not veto opens/closes
    // (a throw here would be treated as a broker rejection and retried
    // forever, silently blocking all trading).
    bt.loggerService.warn(
      "BrokerProxy onSignalCloseCommit is not implemented by the adapter, skipping",
      { symbol: payload.symbol, context: payload.context },
    );
  }

  /**
   * Forwards a partial-profit close event to the underlying adapter.
   * Silently skipped (with a warning log) when the adapter does not implement `onPartialProfitCommit`.
   *
   * @param payload - Partial profit details: symbol, percentToClose, cost, currentPrice, context, backtest flag.
   */
  public async onPartialProfitCommit(
    payload: BrokerPartialProfitPayload,
  ): Promise<void> {
    if (this._instance.onPartialProfitCommit) {
      await this.waitForInit();
      await this._instance.onPartialProfitCommit(payload);
      return;
    }
    // TBrokerCtor documents every IBroker method as optional. Returning
    // normally means "allow" under the gate semantics: an adapter that
    // implements only informational hooks must not veto opens/closes
    // (a throw here would be treated as a broker rejection and retried
    // forever, silently blocking all trading).
    bt.loggerService.warn(
      "BrokerProxy onPartialProfitCommit is not implemented by the adapter, skipping",
      { symbol: payload.symbol, context: payload.context },
    );
  }

  /**
   * Forwards a partial-loss close event to the underlying adapter.
   * Silently skipped (with a warning log) when the adapter does not implement `onPartialLossCommit`.
   *
   * @param payload - Partial loss details: symbol, percentToClose, cost, currentPrice, context, backtest flag.
   */
  public async onPartialLossCommit(
    payload: BrokerPartialLossPayload,
  ): Promise<void> {
    if (this._instance.onPartialLossCommit) {
      await this.waitForInit();
      await this._instance.onPartialLossCommit(payload);
      return;
    }
    // TBrokerCtor documents every IBroker method as optional. Returning
    // normally means "allow" under the gate semantics: an adapter that
    // implements only informational hooks must not veto opens/closes
    // (a throw here would be treated as a broker rejection and retried
    // forever, silently blocking all trading).
    bt.loggerService.warn(
      "BrokerProxy onPartialLossCommit is not implemented by the adapter, skipping",
      { symbol: payload.symbol, context: payload.context },
    );
  }

  /**
   * Forwards a trailing stop-loss update event to the underlying adapter.
   * Silently skipped (with a warning log) when the adapter does not implement `onTrailingStopCommit`.
   *
   * @param payload - Trailing stop details: symbol, percentShift, currentPrice, newStopLossPrice, context, backtest flag.
   */
  public async onTrailingStopCommit(
    payload: BrokerTrailingStopPayload,
  ): Promise<void> {
    if (this._instance.onTrailingStopCommit) {
      await this.waitForInit();
      await this._instance.onTrailingStopCommit(payload);
      return;
    }
    // TBrokerCtor documents every IBroker method as optional. Returning
    // normally means "allow" under the gate semantics: an adapter that
    // implements only informational hooks must not veto opens/closes
    // (a throw here would be treated as a broker rejection and retried
    // forever, silently blocking all trading).
    bt.loggerService.warn(
      "BrokerProxy onTrailingStopCommit is not implemented by the adapter, skipping",
      { symbol: payload.symbol, context: payload.context },
    );
  }

  /**
   * Forwards a trailing take-profit update event to the underlying adapter.
   * Silently skipped (with a warning log) when the adapter does not implement `onTrailingTakeCommit`.
   *
   * @param payload - Trailing take details: symbol, percentShift, currentPrice, newTakeProfitPrice, context, backtest flag.
   */
  public async onTrailingTakeCommit(
    payload: BrokerTrailingTakePayload,
  ): Promise<void> {
    if (this._instance.onTrailingTakeCommit) {
      await this.waitForInit();
      await this._instance.onTrailingTakeCommit(payload);
      return;
    }
    // TBrokerCtor documents every IBroker method as optional. Returning
    // normally means "allow" under the gate semantics: an adapter that
    // implements only informational hooks must not veto opens/closes
    // (a throw here would be treated as a broker rejection and retried
    // forever, silently blocking all trading).
    bt.loggerService.warn(
      "BrokerProxy onTrailingTakeCommit is not implemented by the adapter, skipping",
      { symbol: payload.symbol, context: payload.context },
    );
  }

  /**
   * Forwards a breakeven event to the underlying adapter.
   * Silently skipped (with a warning log) when the adapter does not implement `onBreakevenCommit`.
   *
   * @param payload - Breakeven details: symbol, currentPrice, newStopLossPrice (= effectivePriceOpen), newTakeProfitPrice, context, backtest flag.
   */
  public async onBreakevenCommit(
    payload: BrokerBreakevenPayload,
  ): Promise<void> {
    if (this._instance.onBreakevenCommit) {
      await this.waitForInit();
      await this._instance.onBreakevenCommit(payload);
      return;
    }
    // TBrokerCtor documents every IBroker method as optional. Returning
    // normally means "allow" under the gate semantics: an adapter that
    // implements only informational hooks must not veto opens/closes
    // (a throw here would be treated as a broker rejection and retried
    // forever, silently blocking all trading).
    bt.loggerService.warn(
      "BrokerProxy onBreakevenCommit is not implemented by the adapter, skipping",
      { symbol: payload.symbol, context: payload.context },
    );
  }

  /**
   * Forwards a DCA average-buy entry event to the underlying adapter.
   * Silently skipped (with a warning log) when the adapter does not implement `onAverageBuyCommit`.
   *
   * @param payload - Average buy details: symbol, currentPrice, cost, context, backtest flag.
   */
  public async onAverageBuyCommit(
    payload: BrokerAverageBuyPayload,
  ): Promise<void> {
    if (this._instance.onAverageBuyCommit) {
      await this.waitForInit();
      await this._instance.onAverageBuyCommit(payload);
      return;
    }
    // TBrokerCtor documents every IBroker method as optional. Returning
    // normally means "allow" under the gate semantics: an adapter that
    // implements only informational hooks must not veto opens/closes
    // (a throw here would be treated as a broker rejection and retried
    // forever, silently blocking all trading).
    bt.loggerService.warn(
      "BrokerProxy onAverageBuyCommit is not implemented by the adapter, skipping",
      { symbol: payload.symbol, context: payload.context },
    );
  }
}

/**
 * Facade for broker integration — intercepts all commit* operations before DI-core mutations.
 *
 * Acts as a transaction control point: if any commit* method throws, the DI-core mutation
 * is never reached and the state remains unchanged.
 *
 * In backtest mode all commit* calls are silently skipped (payload.backtest === true).
 * In live mode the call is forwarded to the registered IBroker adapter via BrokerProxy.
 *
 * signal-open and signal-close events are routed automatically via syncSubject subscription
 * (activated on `enable()`). All other commit* methods are called explicitly from
 * Live.ts / Backtest.ts / strategy.ts before the corresponding strategyCoreService call.
 *
 * @example
 * ```typescript
 * import { Broker } from "backtest-kit";
 *
 * // Register a custom broker adapter
 * Broker.useBrokerAdapter(MyBrokerAdapter);
 *
 * // Activate syncSubject subscription (signal-open / signal-close routing)
 * const dispose = Broker.enable();
 *
 * // ... run strategy ...
 *
 * // Deactivate when done
 * Broker.disable();
 * ```
 */
export class BrokerAdapter {
  /** Factory producing the active `BrokerProxy` instance */
  private _brokerFactory: () => BrokerProxy | null = () => null;

  /**
   * Lazily constructs the `BrokerProxy` from the registered factory and
   * memoizes the result via `singleshot`.
   *
   * The proxy is built on the first call and cached for all subsequent calls.
   * Returns `null` when no adapter has been registered via `useBrokerAdapter()`.
   *
   * Reset via `clear()` so the next call rebuilds from the current factory
   * (e.g. when `process.cwd()` changes between strategy iterations).
   */
  private getInstance = singleshot((): BrokerProxy | null => this._brokerFactory());

  /**
   * Forwards a signal-open event to the registered broker adapter.
   *
   * Called automatically via syncSubject when `enable()` is active.
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Signal open details: symbol, cost, position, prices, context, backtest flag
   *
   * @example
   * ```typescript
   * await Broker.commitSignalOpen({
   *   symbol: "BTCUSDT",
   *   cost: 100,
   *   position: "long",
   *   priceOpen: 50000,
   *   priceTakeProfit: 55000,
   *   priceStopLoss: 48000,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitSignalOpen = async (payload: BrokerSignalOpenPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_SIGNAL_OPEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onSignalOpenCommit(payload);
    }
  };

  /**
   * Forwards a signal-close event to the registered broker adapter.
   *
   * Called automatically via syncSubject when `enable()` is active.
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Signal close details: symbol, cost, position, currentPrice, pnl, context, backtest flag
   *
   * @example
   * ```typescript
   * await Broker.commitSignalClose({
   *   symbol: "BTCUSDT",
   *   cost: 100,
   *   position: "long",
   *   currentPrice: 54000,
   *   priceTakeProfit: 55000,
   *   priceStopLoss: 48000,
   *   totalEntries: 2,
   *   totalPartials: 1,
   *   pnl: { profit: 80, loss: 0, volume: 100 },
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitSignalClose = async (payload: BrokerSignalClosePayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_SIGNAL_CLOSE, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onSignalCloseCommit(payload);
    }
  };

  /**
   * Forwards an order ping to the registered broker adapter.
   *
   * Called automatically via syncPendingSubject when `enable()` is active, on every live tick
   * while a pending signal (payload.type "active") or a scheduled signal (payload.type
   * "schedule") is monitored. Skipped silently in backtest mode or when no adapter is
   * registered. Exceptions are NOT swallowed: a throw from the adapter propagates up to
   * syncPendingSubject.next() → CREATE_SYNC_PENDING_FN, which closes the position with "closed"
   * (type "active") or cancels the scheduled signal with reason "user" (type "schedule").
   *
   * @param payload - Order ping details: type, symbol, position, prices, pnl, context, backtest flag
   */
  public commitSignalPending = async (payload: BrokerSignalPendingPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_SIGNAL_PENDING, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onOrderCheck(payload);
    }
  };

  /**
   * Forwards an active-ping to the registered broker adapter.
   *
   * Called automatically via activePingSubject when `enable()` is active, on every live tick while a
   * pending signal is monitored. Skipped silently in backtest mode or when no adapter is registered.
   * Purely informational — a throw does NOT close the position.
   *
   * @param payload - Active ping details: symbol, signalId, position, prices, pnl, context, backtest
   */
  public commitActivePing = async (payload: BrokerActivePingPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_ACTIVE_PING, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onSignalActivePing(payload);
    }
  };

  /**
   * Forwards a schedule-ping to the registered broker adapter.
   *
   * Called automatically via schedulePingSubject when `enable()` is active, on every live tick while
   * a scheduled signal is monitored. Skipped silently in backtest mode or when no adapter is
   * registered. Purely informational.
   *
   * @param payload - Schedule ping details: symbol, signalId, position, prices, context, backtest
   */
  public commitSchedulePing = async (payload: BrokerSchedulePingPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_SCHEDULE_PING, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onSignalSchedulePing(payload);
    }
  };

  /**
   * Forwards an idle-ping to the registered broker adapter.
   *
   * Called automatically via idlePingSubject when `enable()` is active, on every live tick while the
   * strategy has no pending or scheduled signal. Skipped silently in backtest mode or when no adapter
   * is registered. Purely informational.
   *
   * @param payload - Idle ping details: symbol, currentPrice, context, backtest
   */
  public commitIdlePing = async (payload: BrokerIdlePingPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_IDLE_PING, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onSignalIdlePing(payload);
    }
  };

  /**
   * Forwards a scheduled-signal-open to the registered broker adapter.
   *
   * Called automatically via scheduleEventSubject (action "scheduled") when a scheduled signal is
   * created. Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Scheduled open details: symbol, signalId, position, prices, context, backtest
   */
  public commitScheduleOpen = async (payload: BrokerScheduleOpenPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_SCHEDULE_OPEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onSignalScheduleOpen(payload);
    }
  };

  /**
   * Forwards a scheduled-signal-cancelled to the registered broker adapter.
   *
   * Called automatically via scheduleEventSubject (action "cancelled") when a scheduled signal is
   * removed before activation. Skipped silently in backtest mode or when no adapter is registered.
   *
   * IMPORTANT (adapter responsibility): the cancel may race the real fill. The framework decides
   * to drop the scheduled signal from ITS view (risk reject at activation, sync reject, stop,
   * timeout), but the resting limit order on the exchange may have ALREADY filled by the time this
   * arrives. The adapter MUST check the actual order status before cancelling: if the order is
   * filled, cancelling is a no-op on the exchange and the adapter owns the resulting position
   * (close it or reconcile via onOrderCheck / onSignalActivePing). The framework cannot model
   * this case — from its side the signal is terminally cancelled.
   *
   * @param payload - Scheduled cancel details: symbol, signalId, position, prices, reason, context, backtest
   */
  public commitScheduleCancelled = async (payload: BrokerScheduleCancelledPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_SCHEDULE_CANCELLED, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onSignalScheduleCancelled(payload);
    }
  };

  /**
   * Forwards a pending-signal-open to the registered broker adapter.
   *
   * Called automatically via signalEventSubject (action "opened") when a pending position is opened.
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Pending open details: symbol, signalId, position, prices, context, backtest
   */
  public commitPendingOpen = async (payload: BrokerPendingOpenPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_PENDING_OPEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onSignalPendingOpen(payload);
    }
  };

  /**
   * Forwards a pending-signal-close to the registered broker adapter.
   *
   * Called automatically via signalEventSubject (action "closed") when a pending position is closed.
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Pending close details: symbol, signalId, position, prices, closeReason, context, backtest
   */
  public commitPendingClose = async (payload: BrokerPendingClosePayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_PENDING_CLOSE, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onSignalPendingClose(payload);
    }
  };

  /**
   * Intercepts a partial-profit close before DI-core mutation.
   *
   * Called explicitly from Live.ts / Backtest.ts / strategy.ts after all validations pass,
   * but before `strategyCoreService.partialProfit()`. If this method throws, the DI mutation
   * is skipped and state remains unchanged.
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Partial profit details: symbol, percentToClose, cost (dollar value), currentPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * await Broker.commitPartialProfit({
   *   symbol: "BTCUSDT",
   *   percentToClose: 30,
   *   cost: 30,
   *   currentPrice: 52000,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitPartialProfit = async (payload: BrokerPartialProfitPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_PARTIAL_PROFIT, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onPartialProfitCommit(payload);
    }
  };

  /**
   * Intercepts a partial-loss close before DI-core mutation.
   *
   * Called explicitly from Live.ts / Backtest.ts / strategy.ts after all validations pass,
   * but before `strategyCoreService.partialLoss()`. If this method throws, the DI mutation
   * is skipped and state remains unchanged.
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Partial loss details: symbol, percentToClose, cost (dollar value), currentPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * await Broker.commitPartialLoss({
   *   symbol: "BTCUSDT",
   *   percentToClose: 40,
   *   cost: 40,
   *   currentPrice: 48500,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitPartialLoss = async (payload: BrokerPartialLossPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_PARTIAL_LOSS, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onPartialLossCommit(payload);
    }
  };

  /**
   * Intercepts a trailing stop-loss update before DI-core mutation.
   *
   * Called explicitly after all validations pass, but before `strategyCoreService.trailingStop()`.
   * `newStopLossPrice` is the absolute price computed from percentShift + original SL + effectivePriceOpen.
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Trailing stop details: symbol, percentShift, currentPrice, newStopLossPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalSL=90, percentShift=-5 → newSL=95
   * await Broker.commitTrailingStop({
   *   symbol: "BTCUSDT",
   *   percentShift: -5,
   *   currentPrice: 102,
   *   newStopLossPrice: 95,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitTrailingStop = async (payload: BrokerTrailingStopPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_TRAILING_STOP, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onTrailingStopCommit(payload);
    }
  };

  /**
   * Intercepts a trailing take-profit update before DI-core mutation.
   *
   * Called explicitly after all validations pass, but before `strategyCoreService.trailingTake()`.
   * `newTakeProfitPrice` is the absolute price computed from percentShift + original TP + effectivePriceOpen.
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Trailing take details: symbol, percentShift, currentPrice, newTakeProfitPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalTP=110, percentShift=-3 → newTP=107
   * await Broker.commitTrailingTake({
   *   symbol: "BTCUSDT",
   *   percentShift: -3,
   *   currentPrice: 102,
   *   newTakeProfitPrice: 107,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitTrailingTake = async (payload: BrokerTrailingTakePayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_TRAILING_TAKE, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onTrailingTakeCommit(payload);
    }
  };

  /**
   * Intercepts a breakeven operation before DI-core mutation.
   *
   * Called explicitly after all validations pass, but before `strategyCoreService.breakeven()`.
   * `newStopLossPrice` equals effectivePriceOpen (entry price).
   * `newTakeProfitPrice` equals `_trailingPriceTakeProfit ?? priceTakeProfit` (TP is unchanged by breakeven).
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Breakeven details: symbol, currentPrice, newStopLossPrice, newTakeProfitPrice, context, backtest flag
   *
   * @example
   * ```typescript
   * // LONG: entry=100, currentPrice=100.5, newSL=100 (entry), newTP=110 (unchanged)
   * await Broker.commitBreakeven({
   *   symbol: "BTCUSDT",
   *   currentPrice: 100.5,
   *   newStopLossPrice: 100,
   *   newTakeProfitPrice: 110,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitBreakeven = async (payload: BrokerBreakevenPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_BREAKEVEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onBreakevenCommit(payload);
    }
  };

  /**
   * Intercepts a DCA average-buy entry before DI-core mutation.
   *
   * Called explicitly after all validations pass, but before `strategyCoreService.averageBuy()`.
   * `currentPrice` is the market price at which the new DCA entry is added.
   * `cost` is the dollar amount of the new entry (default: CC_POSITION_ENTRY_COST).
   *
   * Skipped silently in backtest mode or when no adapter is registered.
   *
   * @param payload - Average buy details: symbol, currentPrice, cost, context, backtest flag
   *
   * @example
   * ```typescript
   * // Add DCA entry at current market price
   * await Broker.commitAverageBuy({
   *   symbol: "BTCUSDT",
   *   currentPrice: 42000,
   *   cost: 100,
   *   context: { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" },
   *   backtest: false,
   * });
   * ```
   */
  public commitAverageBuy = async (payload: BrokerAverageBuyPayload) => {
    bt.loggerService.info(BROKER_METHOD_NAME_COMMIT_AVERAGE_BUY, {
      symbol: payload.symbol,
      context: payload.context,
    });
    if (!this.enable.hasValue()) {
      return;
    }
    if (payload.backtest) {
      return;
    }
    const instance = this.getInstance();
    if (instance) {
      await instance.onAverageBuyCommit(payload);
    }
  };

  /**
   * Registers a broker adapter instance or constructor to receive commit* callbacks.
   *
   * Must be called before `enable()`. Accepts either a class constructor (called with `new`)
   * or an already-instantiated object implementing `Partial<IBroker>`.
   *
   * @param broker - IBroker constructor or instance
   *
   * @example
   * ```typescript
   * import { Broker } from "backtest-kit";
   *
   * // Register via constructor
   * Broker.useBrokerAdapter(MyBrokerAdapter);
   *
   * // Register via instance
   * Broker.useBrokerAdapter(new MyBrokerAdapter());
   * ```
   */
  public useBrokerAdapter = (broker: TBrokerCtor | Partial<IBroker>) => {
    bt.loggerService.info(BROKER_METHOD_NAME_USE_BROKER_ADAPTER, {});
    if (typeof broker === "function") {
      this._brokerFactory = () => new BrokerProxy(Reflect.construct(broker, []));
    } else {
      this._brokerFactory = () => new BrokerProxy(broker);
    }
    this.getInstance.clear();
  };

  /**
   * Activates the broker: subscribes to syncSubject for signal-open / signal-close routing.
   *
   * Must be called after `useBrokerAdapter()`. Returns a dispose function that unsubscribes
   * from syncSubject (equivalent to calling `disable()`).
   *
   * Calling `enable()` without a registered adapter throws immediately.
   * Calling `enable()` more than once is idempotent (singleshot guard).
   *
   * @returns Dispose function — call it to deactivate the broker subscription
   *
   * @example
   * ```typescript
   * import { Broker } from "backtest-kit";
   *
   * Broker.useBrokerAdapter(MyBrokerAdapter);
   * const dispose = Broker.enable();
   *
   * // ... run backtest or live session ...
   *
   * dispose(); // or Broker.disable()
   * ```
   */
  public enable = singleshot(() => {
    bt.loggerService.info(BROKER_METHOD_NAME_ENABLE, {});
    const instance = this.getInstance();
    if (!instance) {
      this.enable.clear();
      throw new Error("No broker instance provided. Call Broker.useBrokerAdapter first.");
    }

    const unSignalOpen = syncSubject.subscribe(async (event) => {
      if (event.action !== "signal-open") {
        return;
      }
      await this.commitSignalOpen({
        position: event.signal.position,
        cost: event.signal.cost,
        symbol: event.symbol,
        signalId: event.signalId,
        priceTakeProfit: event.signal.priceTakeProfit,
        priceStopLoss: event.signal.priceStopLoss,
        priceOpen: event.signal.priceOpen,
        pnl: event.signal.pnl,
        peakProfit: event.signal.peakProfit,
        maxDrawdown: event.signal.maxDrawdown,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const unSignalClose = syncSubject.subscribe(async (event) => {
      if (event.action !== "signal-close") {
        return;
      }
      await this.commitSignalClose({
        position: event.signal.position,
        currentPrice: event.currentPrice,
        cost: event.signal.cost,
        symbol: event.symbol,
        signalId: event.signalId,
        pnl: event.signal.pnl,
        priceOpen: event.signal.priceOpen,
        peakProfit: event.signal.peakProfit,
        maxDrawdown: event.signal.maxDrawdown,
        totalEntries: event.totalEntries,
        totalPartials: event.totalPartials,
        priceStopLoss: event.signal.priceStopLoss,
        priceTakeProfit: event.signal.priceTakeProfit,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const unSignalPending = syncPendingSubject.subscribe(async (event) => {
      await this.commitSignalPending({
        type: event.type,
        position: event.position,
        currentPrice: event.currentPrice,
        symbol: event.symbol,
        signalId: event.signalId,
        priceOpen: event.priceOpen,
        priceTakeProfit: event.priceTakeProfit,
        priceStopLoss: event.priceStopLoss,
        pnl: event.pnl,
        peakProfit: event.peakProfit,
        maxDrawdown: event.maxDrawdown,
        totalEntries: event.totalEntries,
        totalPartials: event.totalPartials,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const unActivePing = activePingSubject.subscribe(async (event) => {
      await this.commitActivePing({
        symbol: event.symbol,
        signalId: event.data.id,
        position: event.data.position,
        currentPrice: event.currentPrice,
        priceOpen: event.data.priceOpen,
        priceTakeProfit: event.data.priceTakeProfit,
        priceStopLoss: event.data.priceStopLoss,
        pnl: event.data.pnl,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const unSchedulePing = schedulePingSubject.subscribe(async (event) => {
      await this.commitSchedulePing({
        symbol: event.symbol,
        signalId: event.data.id,
        position: event.data.position,
        currentPrice: event.currentPrice,
        priceOpen: event.data.priceOpen,
        priceTakeProfit: event.data.priceTakeProfit,
        priceStopLoss: event.data.priceStopLoss,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const unIdlePing = idlePingSubject.subscribe(async (event) => {
      await this.commitIdlePing({
        symbol: event.symbol,
        currentPrice: event.currentPrice,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      });
    });

    const unScheduleEvent = scheduleEventSubject.subscribe(async (event) => {
      const payload = {
        symbol: event.symbol,
        signalId: event.data.id,
        position: event.data.position,
        currentPrice: event.currentPrice,
        priceOpen: event.data.priceOpen,
        priceTakeProfit: event.data.priceTakeProfit,
        priceStopLoss: event.data.priceStopLoss,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      };
      if (event.action === "scheduled") {
        await this.commitScheduleOpen(payload);
        return;
      }
      await this.commitScheduleCancelled({ ...payload, reason: event.reason });
    });

    const unSignalEvent = signalEventSubject.subscribe(async (event) => {
      const payload = {
        symbol: event.symbol,
        signalId: event.data.id,
        position: event.data.position,
        currentPrice: event.currentPrice,
        priceOpen: event.data.priceOpen,
        priceTakeProfit: event.data.priceTakeProfit,
        priceStopLoss: event.data.priceStopLoss,
        context: {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
        backtest: event.backtest,
      };
      if (event.action === "opened") {
        await this.commitPendingOpen(payload);
        return;
      }
      await this.commitPendingClose({ ...payload, closeReason: event.closeReason });
    });

    const disposeFn = compose(
      () => unSignalOpen(),
      () => unSignalClose(),
      () => unSignalPending(),
      () => unActivePing(),
      () => unSchedulePing(),
      () => unIdlePing(),
      () => unScheduleEvent(),
      () => unSignalEvent(),
    );

    return () => {
      this.enable.clear();
      disposeFn();
    };
  });

  /**
   * Deactivates the broker: unsubscribes from syncSubject and resets the singleshot guard.
   *
   * Idempotent — safe to call even if `enable()` was never called.
   * After `disable()`, `enable()` can be called again to reactivate.
   *
   * @example
   * ```typescript
   * import { Broker } from "backtest-kit";
   *
   * Broker.useBrokerAdapter(MyBrokerAdapter);
   * Broker.enable();
   *
   * // Stop receiving events
   * Broker.disable();
   * ```
   */
  public disable = () => {
    bt.loggerService.info(BROKER_METHOD_NAME_DISABLE, {});
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  /**
   * Clears the cached broker instance and resets the enable singleshot.
   * Call this when process.cwd() changes between strategy iterations
   * so a new broker instance is created with the updated base path.
   */
  public clear = (): void => {
    bt.loggerService.info(BROKER_METHOD_NAME_CLEAR, {});
    this.getInstance.clear();
    this.enable.clear();
  };
}

/**
 * Base class for custom broker adapter implementations.
 *
 * Provides default no-op implementations for all IBroker methods that log events.
 * Extend this class to implement a real exchange adapter for:
 * - Placing and canceling limit/market orders
 * - Updating stop-loss and take-profit levels on exchange
 * - Tracking position state in an external system
 * - Sending trade notifications (Telegram, Discord, Email)
 * - Recording trades to a database or analytics service
 *
 * Key features:
 * - All methods have default implementations (no need to override unused methods)
 * - Automatic logging of all events via bt.loggerService
 * - Implements the full IBroker interface
 * - `makeExtendable` applied for correct subclass instantiation
 *
 * Lifecycle:
 * 1. Constructor called (no arguments)
 * 2. `waitForInit()` called once for async initialization (e.g. exchange login)
 * 3. Event methods called as strategy executes
 * 4. No explicit dispose — clean up in `waitForInit` teardown or externally
 *
 * Event flow (called only in live mode, skipped in backtest):
 * - `onSignalOpenCommit` — new position opened
 * - `onSignalCloseCommit` — position closed (SL/TP hit or manual close)
 * - `onPartialProfitCommit` — partial close at profit executed
 * - `onPartialLossCommit` — partial close at loss executed
 * - `onTrailingStopCommit` — trailing stop-loss updated
 * - `onTrailingTakeCommit` — trailing take-profit updated
 * - `onBreakevenCommit` — stop-loss moved to entry price
 * - `onAverageBuyCommit` — new DCA entry added to position
 *
 * @example
 * ```typescript
 * import { BrokerBase, Broker } from "backtest-kit";
 *
 * // Extend BrokerBase and override only needed methods
 * class BinanceBroker extends BrokerBase {
 *   private client: BinanceClient | null = null;
 *
 *   async waitForInit() {
 *     super.waitForInit(); // Call parent for logging
 *     this.client = new BinanceClient(process.env.API_KEY, process.env.SECRET);
 *     await this.client.connect();
 *   }
 *
 *   async onSignalOpenCommit(payload: BrokerSignalOpenPayload) {
 *     super.onSignalOpenCommit(payload); // Call parent for logging
 *     await this.client!.placeOrder({
 *       symbol: payload.symbol,
 *       side: payload.position === "long" ? "BUY" : "SELL",
 *       quantity: payload.cost / payload.priceOpen,
 *     });
 *   }
 *
 *   async onSignalCloseCommit(payload: BrokerSignalClosePayload) {
 *     super.onSignalCloseCommit(payload); // Call parent for logging
 *     await this.client!.closePosition(payload.symbol);
 *   }
 * }
 *
 * // Register the adapter
 * Broker.useBrokerAdapter(BinanceBroker);
 * Broker.enable();
 * ```
 *
 * @example
 * ```typescript
 * // Minimal implementation — only handle opens and closes
 * class NotifyBroker extends BrokerBase {
 *   async onSignalOpenCommit(payload: BrokerSignalOpenPayload) {
 *     await sendTelegram(`Opened ${payload.position} on ${payload.symbol}`);
 *   }
 *
 *   async onSignalCloseCommit(payload: BrokerSignalClosePayload) {
 *     const pnl = payload.pnl.profit - payload.pnl.loss;
 *     await sendTelegram(`Closed ${payload.symbol}: PnL $${pnl.toFixed(2)}`);
 *   }
 * }
 * ```
 */
class BrokerBase implements IBroker {
  /**
   * Performs async initialization before the broker starts receiving events.
   *
   * Called once by BrokerProxy via `waitForInit()` (singleshot) before the first event.
   * Override to establish exchange connections, authenticate API clients, load configuration.
   *
   * Default implementation: Logs initialization event.
   *
   * @example
   * ```typescript
   * async waitForInit() {
   *   super.waitForInit(); // Keep parent logging
   *   this.exchange = new ExchangeClient(process.env.API_KEY);
   *   await this.exchange.authenticate();
   * }
   * ```
   */
  public async waitForInit(): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_WAIT_FOR_INIT, {});
  }

  /**
   * Called when a position is being opened (signal activated).
   *
   * Triggered automatically via syncSubject when a scheduled signal's priceOpen is hit.
   * Use to place the actual entry order on the exchange.
   *
   * Default implementation: Logs signal-open event.
   *
   * Manual wiring — EXCEPTION-BASED GATE: emitted BEFORE the framework mutates state, so a THROW here
   * (e.g. limit order rejected) rolls back the open — the pending signal returns to idle and retries
   * next tick; return normally to let it open. Live-only (backtest short-circuits). See
   * {@link IBroker.onSignalOpenCommit} for the full semantics.
   *
   * @param payload - Signal open details: symbol, cost, position, priceOpen, priceTakeProfit, priceStopLoss, context, backtest
   *
   * @example
   * ```typescript
   * async onSignalOpenCommit(payload: BrokerSignalOpenPayload) {
   *   super.onSignalOpenCommit(payload); // Keep parent logging
   *   const order = await this.exchange.placeMarketOrder({
   *     symbol: payload.symbol,
   *     side: payload.position === "long" ? "BUY" : "SELL",
   *     quantity: payload.cost / payload.priceOpen,
   *   });
   *   if (!order.filled) {
   *     throw new Error(`Entry not filled for ${payload.symbol}`); // -> roll back the open, retry next tick
   *   }
   * }
   * ```
   */
  public async onSignalOpenCommit(payload: BrokerSignalOpenPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_SIGNAL_OPEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called on every live tick while a pending signal is monitored, BEFORE TP/SL/time evaluation.
   *
   * Override to query the exchange for the order by `payload.signalId` and THROW ONLY when it is
   * definitively NOT FOUND by that id (filled, cancelled, or liquidated externally) — the framework
   * then closes the position with closeReason "closed". The default implementation logs and returns
   * normally, which keeps the position under normal TP/SL monitoring.
   *
   * CRITICAL: swallow transient/network errors (timeout, 5xx, rate limit, disconnect) — return
   * normally instead of throwing. A thrown network error would wrongly close an open position; only
   * a confirmed "order not found by id" response is a valid reason to throw.
   *
   * Manual wiring — EXCEPTION-BASED VARIANT: the throw-driven alternative to the imperative
   * commit-function wiring in `onSignalActivePing`. See {@link IBroker.onOrderCheck} for the full
   * comparison and example.
   *
   * @param payload - Pending ping details: symbol, signalId, position, prices, pnl, context, backtest
   */
  public async onOrderCheck(payload: BrokerSignalPendingPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_SIGNAL_PENDING, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called on every live tick while a pending (open) signal is monitored.
   *
   * Purely informational mirror of the active-ping lifecycle — unlike `onOrderCheck`, a throw here
   * does NOT close the position. Override to mirror live monitoring state into your own systems.
   * The default implementation logs.
   *
   * Manual wiring — EVENT-BASED: this is the primary per-tick hook to drive an open position from real exchange
   * state (`commitCreateTakeProfit` / `commitCreateStopLoss` / `commitClosePending`). See the
   * {@link IBroker.onSignalActivePing} contract docs for the full guidance and example.
   *
   * @param payload - Active ping details: symbol, signalId, position, prices, pnl, context, backtest
   */
  public async onSignalActivePing(payload: BrokerActivePingPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_ACTIVE_PING, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called on every live tick while a scheduled signal is monitored (waiting for priceOpen).
   *
   * Purely informational. Override to mirror scheduled-monitoring state. The default logs.
   *
   * Manual wiring — EVENT-BASED: per-tick hook to drive a scheduled (resting) order from real exchange state
   * (`commitActivateScheduled` / `commitCancelScheduled`). See {@link IBroker.onSignalSchedulePing}
   * for full guidance and example.
   *
   * @param payload - Schedule ping details: symbol, signalId, position, prices, context, backtest
   */
  public async onSignalSchedulePing(payload: BrokerSchedulePingPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_SCHEDULE_PING, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called on every live tick while the strategy is idle (no pending or scheduled signal).
   *
   * Purely informational. Override to track idle heartbeats. The default logs.
   *
   * @param payload - Idle ping details: symbol, currentPrice, context, backtest
   */
  public async onSignalIdlePing(payload: BrokerIdlePingPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_IDLE_PING, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when a new scheduled signal is created and starts waiting for priceOpen activation.
   *
   * The scheduled -> active transition is reported via `onSignalOpenCommit`, not here. Override to
   * place a resting/limit order on the exchange. The default logs.
   *
   * Manual wiring — EVENT-BASED: fires ONCE at creation — place the real resting order (tag it with
   * `payload.signalId`) and optionally `commitActivateScheduled` / `commitCancelScheduled`. See
   * {@link IBroker.onSignalScheduleOpen} for full guidance and example.
   *
   * @param payload - Scheduled open details: symbol, signalId, position, prices, context, backtest
   */
  public async onSignalScheduleOpen(payload: BrokerScheduleOpenPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_SCHEDULE_OPEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when a scheduled signal is cancelled before activation (timeout / price_reject / user).
   *
   * Override to cancel the resting/limit order on the exchange. The default logs.
   *
   * Manual wiring — EVENT-BASED (outbound): the strategy already dropped the scheduled signal — cancel the matching
   * exchange order by `payload.signalId`. See {@link IBroker.onSignalScheduleCancelled}.
   *
   * @param payload - Scheduled cancel details: symbol, signalId, position, prices, reason, context, backtest
   */
  public async onSignalScheduleCancelled(payload: BrokerScheduleCancelledPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_SCHEDULE_CANCELLED, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when a pending position is opened (new signal / immediate / scheduled or user activation).
   *
   * Informational lifecycle hook. Override to mirror the open into your own systems. The default logs.
   *
   * Manual wiring — EVENT-BASED: fires ONCE at open — place entry + protective TP/SL orders (tag with
   * `payload.signalId`), then drive per-tick from `onSignalActivePing`. See
   * {@link IBroker.onSignalPendingOpen}.
   *
   * @param payload - Pending open details: symbol, signalId, position, prices, context, backtest
   */
  public async onSignalPendingOpen(payload: BrokerPendingOpenPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_PENDING_OPEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when a pending position is closed (take_profit / stop_loss / time_expired / closed).
   *
   * Informational lifecycle hook. Override to mirror the close into your own systems. The default logs.
   *
   * Manual wiring — EVENT-BASED (outbound): the strategy already removed the pending signal — flatten the real
   * position and cancel leftover TP/SL orders by `payload.signalId`. See
   * {@link IBroker.onSignalPendingClose}.
   *
   * @param payload - Pending close details: symbol, signalId, position, prices, closeReason, context, backtest
   */
  public async onSignalPendingClose(payload: BrokerPendingClosePayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_PENDING_CLOSE, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when a position is being closed (SL/TP hit or manual close).
   *
   * Triggered automatically via syncSubject when a pending signal is closed.
   * Use to place the exit order and record final PnL.
   *
   * Default implementation: Logs signal-close event.
   *
   * Manual wiring — EXCEPTION-BASED GATE: emitted BEFORE the framework mutates state, so a THROW here
   * (e.g. exit order failed) SKIPS the close — the position stays open and the close retries next
   * tick; return normally to let it close. Live-only (backtest short-circuits). See
   * {@link IBroker.onSignalCloseCommit} for the full semantics.
   *
   * @param payload - Signal close details: symbol, cost, position, currentPrice, pnl, totalEntries, totalPartials, context, backtest
   *
   * @example
   * ```typescript
   * async onSignalCloseCommit(payload: BrokerSignalClosePayload) {
   *   super.onSignalCloseCommit(payload); // Keep parent logging
   *   const ok = await this.exchange.closePosition(payload.symbol);
   *   if (!ok) {
   *     throw new Error(`Exit not filled for ${payload.symbol}`); // -> keep position open, retry next tick
   *   }
   *   await this.db.recordTrade({ symbol: payload.symbol, pnl: payload.pnl });
   * }
   * ```
   */
  public async onSignalCloseCommit(payload: BrokerSignalClosePayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_SIGNAL_CLOSE, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when a partial close at profit is executed.
   *
   * Triggered explicitly from strategy.ts / Live.ts / Backtest.ts after all validations pass,
   * before `strategyCoreService.partialProfit()`. If this method throws, the DI mutation is skipped.
   * Use to partially close the position on the exchange at the profit level.
   *
   * Default implementation: Logs partial profit event.
   *
   * @param payload - Partial profit details: symbol, percentToClose, cost (dollar value), currentPrice, context, backtest
   *
   * @example
   * ```typescript
   * async onPartialProfitCommit(payload: BrokerPartialProfitPayload) {
   *   super.onPartialProfitCommit(payload); // Keep parent logging
   *   await this.exchange.reducePosition({
   *     symbol: payload.symbol,
   *     dollarAmount: payload.cost,
   *     price: payload.currentPrice,
   *   });
   * }
   * ```
   */
  public async onPartialProfitCommit(payload: BrokerPartialProfitPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_PARTIAL_PROFIT, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when a partial close at loss is executed.
   *
   * Triggered explicitly from strategy.ts / Live.ts / Backtest.ts after all validations pass,
   * before `strategyCoreService.partialLoss()`. If this method throws, the DI mutation is skipped.
   * Use to partially close the position on the exchange at the loss level.
   *
   * Default implementation: Logs partial loss event.
   *
   * @param payload - Partial loss details: symbol, percentToClose, cost (dollar value), currentPrice, context, backtest
   *
   * @example
   * ```typescript
   * async onPartialLossCommit(payload: BrokerPartialLossPayload) {
   *   super.onPartialLossCommit(payload); // Keep parent logging
   *   await this.exchange.reducePosition({
   *     symbol: payload.symbol,
   *     dollarAmount: payload.cost,
   *     price: payload.currentPrice,
   *   });
   * }
   * ```
   */
  public async onPartialLossCommit(payload: BrokerPartialLossPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_PARTIAL_LOSS, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when the trailing stop-loss level is updated.
   *
   * Triggered explicitly after all validations pass, before `strategyCoreService.trailingStop()`.
   * `newStopLossPrice` is the absolute SL price — use it to update the exchange order directly.
   *
   * Default implementation: Logs trailing stop event.
   *
   * @param payload - Trailing stop details: symbol, percentShift, currentPrice, newStopLossPrice, context, backtest
   *
   * @example
   * ```typescript
   * async onTrailingStopCommit(payload: BrokerTrailingStopPayload) {
   *   super.onTrailingStopCommit(payload); // Keep parent logging
   *   await this.exchange.updateStopLoss({
   *     symbol: payload.symbol,
   *     price: payload.newStopLossPrice,
   *   });
   * }
   * ```
   */
  public async onTrailingStopCommit(payload: BrokerTrailingStopPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_TRAILING_STOP, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when the trailing take-profit level is updated.
   *
   * Triggered explicitly after all validations pass, before `strategyCoreService.trailingTake()`.
   * `newTakeProfitPrice` is the absolute TP price — use it to update the exchange order directly.
   *
   * Default implementation: Logs trailing take event.
   *
   * @param payload - Trailing take details: symbol, percentShift, currentPrice, newTakeProfitPrice, context, backtest
   *
   * @example
   * ```typescript
   * async onTrailingTakeCommit(payload: BrokerTrailingTakePayload) {
   *   super.onTrailingTakeCommit(payload); // Keep parent logging
   *   await this.exchange.updateTakeProfit({
   *     symbol: payload.symbol,
   *     price: payload.newTakeProfitPrice,
   *   });
   * }
   * ```
   */
  public async onTrailingTakeCommit(payload: BrokerTrailingTakePayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_TRAILING_TAKE, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when the stop-loss is moved to breakeven (entry price).
   *
   * Triggered explicitly after all validations pass, before `strategyCoreService.breakeven()`.
   * `newStopLossPrice` equals `effectivePriceOpen` — the position's effective entry price.
   * `newTakeProfitPrice` is unchanged by breakeven.
   *
   * Default implementation: Logs breakeven event.
   *
   * @param payload - Breakeven details: symbol, currentPrice, newStopLossPrice, newTakeProfitPrice, context, backtest
   *
   * @example
   * ```typescript
   * async onBreakevenCommit(payload: BrokerBreakevenPayload) {
   *   super.onBreakevenCommit(payload); // Keep parent logging
   *   await this.exchange.updateStopLoss({
   *     symbol: payload.symbol,
   *     price: payload.newStopLossPrice, // = entry price
   *   });
   * }
   * ```
   */
  public async onBreakevenCommit(payload: BrokerBreakevenPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_BREAKEVEN, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }

  /**
   * Called when a new DCA entry is added to the active position.
   *
   * Triggered explicitly after all validations pass, before `strategyCoreService.averageBuy()`.
   * `currentPrice` is the market price at which the new averaging entry is placed.
   * `cost` is the dollar amount of the new DCA entry.
   *
   * Default implementation: Logs average buy event.
   *
   * @param payload - Average buy details: symbol, currentPrice, cost, context, backtest
   *
   * @example
   * ```typescript
   * async onAverageBuyCommit(payload: BrokerAverageBuyPayload) {
   *   super.onAverageBuyCommit(payload); // Keep parent logging
   *   await this.exchange.placeMarketOrder({
   *     symbol: payload.symbol,
   *     side: "BUY",
   *     quantity: payload.cost / payload.currentPrice,
   *   });
   * }
   * ```
   */
  public async onAverageBuyCommit(payload: BrokerAverageBuyPayload): Promise<void> {
    bt.loggerService.info(BROKER_BASE_METHOD_NAME_ON_AVERAGE_BUY, {
      symbol: payload.symbol,
      context: payload.context,
    });
  }
}

// @ts-ignore
BrokerBase = makeExtendable(BrokerBase);

/**
 * Global singleton instance of BrokerAdapter.
 * Provides static-like access to all broker commit methods and lifecycle controls.
 *
 * @example
 * ```typescript
 * import { Broker } from "backtest-kit";
 *
 * Broker.useBrokerAdapter(MyBrokerAdapter);
 * const dispose = Broker.enable();
 * ```
 */
export const Broker = new BrokerAdapter();

export { BrokerBase };
