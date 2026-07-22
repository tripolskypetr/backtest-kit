import { IPublicSignalRow, StrategyName, IStrategyPnL } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Post-verdict order-check STOP event.
 *
 * The terminal counterpart of OrderContinueContract: the framework decided the
 * order behind the monitored signal is NO LONGER open on the exchange and acts
 * terminally — for `type: "active"` the pending position closes with closeReason
 * "closed", for `type: "schedule"` the scheduled signal cancels (reason "user").
 * Emitted exactly once per monitored signal, right BEFORE the teardown runs.
 *
 * `reason` tells which terminal path fired:
 * - "deleted" — the adapter threw OrderDeletedError: the CONFIRMED "order not
 *   found by id" (filled, cancelled or liquidated externally), terminal at once,
 *   bypassing the tolerance counter;
 * - "exhausted" — CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive transient failures
 *   spent (or the config is 0 — legacy: any failure is terminal on the spot).
 *   For genuine network exhaustion the engine also signals a fatal exit.
 *
 * Live-only: backtest never runs order checks. Notification-only channel:
 * listener exceptions are swallowed at the emission site (logged + errorEmitter)
 * and never affect the already-made terminal decision.
 */
export interface OrderStopContract {
  /** Monitored state: "active" — open position order, "schedule" — resting entry order */
  type: "schedule" | "active";
  /** Which terminal path fired: confirmed not-found ("deleted") or tolerance spent ("exhausted") */
  reason: "deleted" | "exhausted";
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
  /** Consecutive-failure streak at termination (0 for an immediate "deleted" verdict) */
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

export default OrderStopContract;
