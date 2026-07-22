import { IPublicSignalRow, StrategyName, StrategyCloseReason, IStrategyPnL } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Base fields shared by all TERMINAL order rejection events.
 *
 * Emitted by orderRejectSubject strictly when the onOrderSync gate resolved into
 * the terminal "rejected" verdict — the broker adapter threw OrderRejectedError
 * ("the exchange definitively refused this order, retrying is pointless").
 * Post-verdict mirror of the rejection branch, the counterpart of the confirmed
 * OrderFillContract channel.
 *
 * Exactly once per dropped order attempt:
 * - action "signal-open": the open is dropped for good and the rejected signalId
 *   is consumed by the whipsaw guard — the same id is never re-sent, so this
 *   event cannot repeat per-tick for one signal;
 * - action "signal-close": the engine force-closes its state with the original
 *   closeReason; the real exchange position is the adapter's/operator's to
 *   reconcile.
 *
 * NOT emitted:
 * - on transient failures (plain Error / OrderTransientError — those retry
 *   silently within the bounded budgets);
 * - in backtest mode (the gate short-circuits to "confirmed" without an exchange).
 *
 * Listener exceptions are swallowed at the emission site (logged + errorEmitter) —
 * this is a notification-only channel and must never affect the resolved verdict.
 */
interface OrderRejectBase {
  /**
   * Which order was rejected:
   * - "active" — the position order (immediate open, activation fill, close);
   * - "schedule" — the resting entry order being PLACED at scheduled-signal
   *   creation (action "signal-open" only).
   */
  type: "schedule" | "active";
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name that refused the order */
  exchangeName: ExchangeName;
  /** Timeframe name (empty string in live mode) */
  frameName: FrameName;
  /** Always false: rejections are live-only (kept for cross-channel filter uniformity) */
  backtest: boolean;
  /** Unique signal identifier (UUID v4) — equals the adapter's clientOrderId */
  signalId: string;
  /** Timestamp from execution context at the moment the gate rejected */
  timestamp: number;
  /** Complete public signal row at the moment of this event */
  signal: IPublicSignalRow;
  /**
   * Number of CONSECUTIVE failed gate attempts that preceded this TERMINAL one
   * (0 = rejected on the first attempt).
   */
  attempt: number;
  /** Market price at the moment of rejection (VWAP) */
  currentPrice: number;
  /** PNL snapshot of the position at the moment of this event */
  pnl: IStrategyPnL;
  /** Peak profit achieved during the life of this position so far */
  peakProfit: IStrategyPnL;
  /** Maximum drawdown experienced during the life of this position so far */
  maxDrawdown: IStrategyPnL;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Effective entry price (DCA-averaged when entries exist) */
  priceOpen: number;
  /** Effective take profit price (trailing-aware) */
  priceTakeProfit: number;
  /** Effective stop loss price (trailing-aware) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price before any DCA averaging */
  originalPriceOpen: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds */
  pendingAt: number;
  /** Total number of DCA entries (_entry.length); 1 = no averaging */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length) */
  totalPartials: number;
  /** Human-readable rejection reason (the OrderRejectedError message from the broker adapter) */
  message: string;
}

/**
 * Terminal rejection of an open: the position order (type "active") or the
 * resting entry placement (type "schedule") was definitively refused — the
 * trade attempt is dropped and its signalId consumed.
 */
export interface OrderRejectOpenContract extends OrderRejectBase {
  /** Discriminator for the rejected open/placement */
  action: "signal-open";
  /** Cost of the position (sum of entry costs) */
  cost: number;
}

/**
 * Terminal rejection of a close: the exit order was definitively refused —
 * the engine force-closes its state with the original closeReason.
 * Always type "active".
 */
export interface OrderRejectCloseContract extends OrderRejectBase {
  /** Discriminator for the rejected close */
  action: "signal-close";
  /** The closeReason the engine force-closes with */
  closeReason: StrategyCloseReason;
}

/**
 * Discriminated union for terminal order rejection events.
 * Emitted via orderRejectSubject strictly on the "rejected" verdict — see
 * OrderRejectBase for the full semantics and the non-emission cases.
 */
export type OrderRejectContract = OrderRejectOpenContract | OrderRejectCloseContract;

export default OrderRejectContract;
