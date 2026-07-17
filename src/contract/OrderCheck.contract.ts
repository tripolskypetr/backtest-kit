import { IPublicSignalRow, StrategyName, IStrategyPnL } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Signal order-ping sync event.
 *
 * Emitted on every live tick while a signal is being monitored, BEFORE the framework
 * evaluates completion. It asks the external order management system whether the
 * corresponding order is STILL open on the exchange. Fires for BOTH monitored states,
 * discriminated by `type`:
 * - `type: "active"` — a pending signal (open position); the order backing the position.
 * - `type: "schedule"` — a scheduled signal; the resting entry order awaiting activation.
 *
 * Listener contract (resolved into IBrokerOrderVerdict):
 * - Return true (or do nothing) — the order is still open on the exchange, keep monitoring;
 *   the consecutive-failure counter (`attempt`) resets to 0.
 * - Throw OrderDeletedError — the CONFIRMED "order not found by id" (filled, cancelled,
 *   liquidated externally): terminal AT ONCE, bypassing the tolerance counter. For "active"
 *   the framework closes the pending signal with closeReason "closed"; for "schedule" it
 *   cancels the scheduled signal (reason "user").
 * - Return false OR throw a plain Error / OrderTransientError — the check FAILED
 *   transiently (network blip, exchange 5xx): TOLERATED, the order is assumed still open
 *   and the next ping carries `attempt` incremented, up to CC_ORDER_CHECK_RETRY_ATTEMPTS
 *   consecutive failures before the terminal action above fires (with the config at 0 any
 *   failure is terminal on the spot — legacy).
 * - Throw OrderRejectedError — protocol violation in this channel, degrades to transient.
 *   NOTE for "schedule": if the resting order actually FILLED, confirm it via
 *   activateScheduled/commitActivateScheduled instead of failing the ping — a failed ping
 *   is a terminal cancel, not an activation.
 *
 * Backtest never emits this event — there is no live exchange to query.
 *
 * Consumers:
 * - Broker adapter via `onOrderActiveCheck` / `onOrderScheduleCheck` (syncPendingSubject subscription)
 * - Registered actions via `orderCheck` / `onOrderCheck`
 */
export interface OrderCheckContract {
  /** Discriminator for pending-ping action */
  action: "signal-ping";
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
  /** Whether this event is from backtest mode (true) or live mode (false) — always false in practice */
  backtest: boolean;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Timestamp from execution context (tick's when) */
  timestamp: number;
  /** Complete public signal row at the moment of this event */
  signal: IPublicSignalRow;
  /**
   * Number of CONSECUTIVE prior failed checks for this signal (0 = first check /
   * healthy). Managed by the framework: a failed check (false/non-typed throw)
   * increments the counter carried by the next ping while the failure is tolerated
   * as transient (CC_ORDER_CHECK_RETRY_ATTEMPTS); a successful check resets it to 0.
   */
  attempt: number;
  /** Market price at the moment of the ping (VWAP) */
  currentPrice: number;
  /** Unrealized PNL of the open position at the moment of the ping */
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

export default OrderCheckContract;
