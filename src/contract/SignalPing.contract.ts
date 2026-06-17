import { IPublicSignalRow, StrategyName, IStrategyPnL } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Signal pending-ping sync event.
 *
 * Emitted on every live tick while a pending signal (open position) is being monitored,
 * BEFORE the framework evaluates TP/SL/time completion. It asks the external order
 * management system whether the corresponding order is STILL pending (open) on the exchange.
 *
 * Listener contract (mirrors syncSubject semantics):
 * - Return true (or do nothing) — the order is still open on the exchange, keep monitoring.
 * - Return false OR throw — the order is no longer open on the exchange (filled, cancelled,
 *   liquidated externally). The framework closes the pending signal with closeReason "closed".
 *
 * Backtest never emits this event — there is no live exchange to query.
 *
 * Consumers:
 * - Broker adapter via `onOrderPing` (syncPendingSubject subscription)
 * - Registered actions via `orderPing` / `onOrderPing`
 */
export interface SignalPingContract {
  /** Discriminator for pending-ping action */
  action: "signal-ping";
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

export default SignalPingContract;
