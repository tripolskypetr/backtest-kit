import { IPublicSignalRow, StrategyName, IStrategyPnL } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Post-verdict order-check CONTINUE event.
 *
 * The pre-verdict OrderCheckContract (syncPendingSubject) is the ping REQUEST —
 * it fires before the broker adapter answers. This event is its resolved
 * counterpart for the NON-terminal outcome: the framework decided the order is
 * still open on the exchange and monitoring CONTINUES. Emitted on every live
 * tick while the signal survives the check, discriminated by `type`:
 * - `type: "active"` — the order backing an open position (pending signal);
 * - `type: "schedule"` — the resting entry order of a scheduled signal.
 *
 * `attempt` tells which continue-path fired:
 * - 0 — the check CONFIRMED the order (healthy; the failure streak was reset);
 * - >0 — the check FAILED transiently and was TOLERATED (order assumed still
 *   open) — the value is the current consecutive-failure streak, bounded by
 *   CC_ORDER_CHECK_RETRY_ATTEMPTS before the terminal path fires instead
 *   (see OrderStopContract).
 *
 * Live-only: backtest never runs order checks. Notification-only channel:
 * listener exceptions are swallowed at the emission site (logged + errorEmitter)
 * and never affect the already-made monitoring decision.
 */
export interface OrderContinueContract {
  /** Monitored state: "active" — open position order, "schedule" — resting entry order */
  type: "schedule" | "active";
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Timeframe name (empty string in live mode) */
  frameName: FrameName;
  /** Always false: order checks are live-only (kept for cross-channel filter uniformity) */
  backtest: boolean;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Timestamp from execution context (tick's when) */
  timestamp: number;
  /** Complete public signal row at the moment of this event */
  signal: IPublicSignalRow;
  /**
   * Consecutive-failure streak at the moment of this decision: 0 — the check
   * confirmed the order (healthy), >0 — this many consecutive transient
   * failures are currently tolerated (order assumed still open).
   */
  attempt: number;
  /** Market price at the moment of the check (VWAP) */
  currentPrice: number;
  /** Unrealized PNL of the position at the moment of this event */
  pnl: IStrategyPnL;
  /** Peak profit achieved during the life of this position up to this event */
  peakProfit: IStrategyPnL;
  /** Maximum drawdown experienced during the life of this position up to this event */
  maxDrawdown: IStrategyPnL;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Effective entry price (may differ from priceOpen after DCA averaging) */
  priceOpen: number;
  /** Effective take profit price (may differ from original after trailing) */
  priceTakeProfit: number;
  /** Effective stop loss price (may differ from original after trailing) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price before any DCA averaging (initial priceOpen) */
  originalPriceOpen: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds */
  pendingAt: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging done. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = none. */
  totalPartials: number;
}

export default OrderContinueContract;
