import { IPublicSignalRow, StrategyName, StrategyCloseReason, IStrategyPnL } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Base fields shared by all broker-CONFIRMED order fill events.
 *
 * A fill event is NOT a sync event: OrderSyncContract is the pre-verdict gate
 * REQUEST (fired before the broker adapter runs — a rejected or transient attempt
 * still emits there), while OrderFillContract is built ONLY after the onOrderSync
 * gate resolved into the "confirmed" IBrokerOrderVerdict — the broker acknowledged
 * the order really executed/placed on the exchange. This is the channel for
 * notifications and audit trails that must never fire on a mere attempt.
 *
 * NOT emitted:
 * - in backtest mode (the gate short-circuits to "confirmed" without any exchange —
 *   nothing actually filled);
 * - on "transient"/"rejected"/"deleted" verdicts;
 * - on a FORCE-close (close-retry budget exhausted / terminal rejection): the engine
 *   tears its state down WITHOUT broker confirmation, so no fill exists to report.
 *
 * Listener exceptions are swallowed at the emission site (logged + errorEmitter) —
 * this is a notification-only channel and must never affect the resolved verdict.
 */
interface OrderFillBase {
  /**
   * Which order was confirmed:
   * - "active" — the position order: immediate open, activation fill of a resting
   *   order, and every close.
   * - "schedule" — the resting entry order was PLACED on the exchange when a
   *   scheduled signal was created (action "signal-open" only; a placement is not
   *   a position fill — filter by type when strict fill semantics matter).
   */
  type: "schedule" | "active";
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where the order executed */
  exchangeName: ExchangeName;
  /** Timeframe name (empty string in live mode) */
  frameName: FrameName;
  /** Always false: fills are live-only (kept for cross-channel filter uniformity) */
  backtest: boolean;
  /** Unique signal identifier (UUID v4) — equals the adapter's clientOrderId */
  signalId: string;
  /** Timestamp from execution context at the moment the gate confirmed */
  timestamp: number;
  /** Complete public signal row at the moment of this event */
  signal: IPublicSignalRow;
  /**
   * Number of CONSECUTIVE failed gate attempts that preceded this CONFIRMED one
   * (0 = confirmed on the first attempt).
   */
  attempt: number;
  /** Market price at the moment of confirmation (VWAP) */
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
}

/**
 * Broker-confirmed open fill: the position order FILLED (type "active") or the
 * resting entry order was PLACED (type "schedule").
 */
export interface OrderFillOpenContract extends OrderFillBase {
  /** Discriminator for the confirmed open/placement */
  action: "signal-open";
  /** Cost of the position (sum of entry costs) */
  cost: number;
}

/**
 * Broker-confirmed close fill: the exit order executed (TP/SL/time/user close).
 * Always type "active".
 */
export interface OrderFillCloseContract extends OrderFillBase {
  /** Discriminator for the confirmed close */
  action: "signal-close";
  /** Why the position was closed */
  closeReason: StrategyCloseReason;
}

/**
 * Discriminated union for broker-confirmed order fill events.
 * Emitted via orderFillSubject strictly AFTER the "confirmed" verdict — see
 * OrderFillBase for the full semantics and the non-emission cases.
 */
export type OrderFillContract = OrderFillOpenContract | OrderFillCloseContract;

export default OrderFillContract;
