import { IPublicSignalRow, StrategyName, StrategyCloseReason, IStrategyPnL } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Base fields shared by all order sync events.
 */
interface OrderSyncBase {
  /**
   * Which order the sync gate is about:
   * - "active" — the position order: immediate open, activation fill of a resting
   *   order, and every close.
   * - "schedule" — the resting entry order being PLACED when a scheduled signal is
   *   created (action "signal-open" only).
   *
   * Listener throw semantics (resolved into IBrokerOrderVerdict): a plain Error or
   * OrderTransientError = "transient" — the open rolls back and retries
   * identity-stably (same signalId, `attempt` increments) up to
   * CC_ORDER_OPEN_RETRY_ATTEMPTS, the close is skipped and retries up to
   * CC_ORDER_CLOSE_RETRY_ATTEMPTS (then force-close); OrderRejectedError =
   * "rejected", terminal at once (open dropped without retry / close force-closed);
   * OrderDeletedError here is a protocol violation and degrades to "transient".
   */
  type: "schedule" | "active";
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Timeframe name (used in backtest mode, empty string in live mode) */
  frameName: FrameName;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Timestamp from execution context (tick's when or backtest candle timestamp) */
  timestamp: number;
  /** Complete public signal row at the moment of this event */
  signal: IPublicSignalRow;
  /**
   * Number of CONSECUTIVE prior failures of this gate for this signal (0 = first
   * attempt / healthy). Managed by the framework: a rejected gate increments the
   * counter carried by the next attempt; a confirmed gate resets it to 0. Bounded by
   * CC_ORDER_OPEN_RETRY_ATTEMPTS (signal-open) / CC_ORDER_CLOSE_RETRY_ATTEMPTS
   * (signal-close).
   */
  attempt: number;
}

/**
 * Signal open sync event.
 *
 * Emitted when a scheduled (limit order) signal is activated — i.e., the exchange
 * allowed the framework to enter the position by filling the limit order at priceOpen.
 *
 * In backtest mode: fired when candle.low <= priceOpen (long) or candle.high >= priceOpen (short).
 * In live mode: fired when the exchange confirms the limit order is filled.
 *
 * Consumers use this event to synchronize external order management systems
 * (e.g., confirm that a limit buy/sell was executed on the exchange).
 *
 * Consumers:
 * - External order sync services
 * - Audit/logging pipelines
 */
export interface OrderOpenContract extends OrderSyncBase {
  /** Discriminator for signal-open action */
  action: "signal-open";
  /** Market price at the moment of activation (VWAP or candle average) */
  currentPrice: number;
  /** Total PNL of the closed position (including all entries and partials) */
  pnl: IStrategyPnL;
    /** Peak profit achieved during the life of this position up to the moment this public signal was created */
  peakProfit: IStrategyPnL;
  /** Maximum drawdown experienced during the life of this position up to the moment this public signal was created */
  maxDrawdown: IStrategyPnL;
  /** Cost of the position at close (sum of all entry costs) */
  cost: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price at which the limit order was filled */
  priceOpen: number;
  /** Effective take profit price at activation */
  priceTakeProfit: number;
  /** Effective stop loss price at activation */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price before any DCA averaging (initial priceOpen) */
  originalPriceOpen: number;
  /** Signal creation timestamp in milliseconds (when scheduled signal was first created) */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds (set at this event) */
  pendingAt: number;
  /**
   * Total number of DCA entries at the time of close (_entry.length).
   * 1 = no averaging done (only initial entry). 2+ = averaged positions.
   */
  totalEntries: number;
  /**
   * Total number of partial closes executed at the time of close (_partial.length).
   * 0 = no partial closes done. 1+ = partial closes executed.
   */
  totalPartials: number;
}

/**
 * Signal close sync event.
 *
 * Emitted when an active pending signal is closed for any reason:
 * take profit hit, stop loss hit, time expired, or user-initiated close.
 *
 * Consumers use this event to synchronize external order management systems
 * (e.g., cancel remaining OCO orders, record final PNL in external DB).
 *
 * Consumers:
 * - External order sync services
 * - Audit/logging pipelines
 */
export interface OrderCloseContract extends OrderSyncBase {
  /** Discriminator for signal-close action */
  action: "signal-close";
  /** Market price at the moment of close */
  currentPrice: number;
  /** Total PNL of the closed position (including all entries and partials) */
  pnl: IStrategyPnL;
  /** Peak profit achieved during the life of this position up to the moment this public signal was created */
  peakProfit: IStrategyPnL;
  /** Maximum drawdown experienced during the life of this position up to the moment this public signal was created */
  maxDrawdown: IStrategyPnL;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Effective entry price at time of close (may differ from priceOpen after DCA averaging) */
  priceOpen: number;
  /** Effective take profit price at close (may differ from original after trailing) */
  priceTakeProfit: number;
  /** Effective stop loss price at close (may differ from original after trailing) */
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
  /** Why the signal was closed */
  closeReason: StrategyCloseReason;
  /**
   * Total number of DCA entries at the time of close (_entry.length).
   * 1 = no averaging done (only initial entry). 2+ = averaged positions.
   */
  totalEntries: number;
  /**
   * Total number of partial closes executed at the time of close (_partial.length).
   * 0 = no partial closes done. 1+ = partial closes executed.
   */
  totalPartials: number;
}

/**
 * Discriminated union for order sync events.
 *
 * Emitted to allow external systems to synchronize with the framework's
 * order lifecycle: open (type "active" — immediate/activation fill; type
 * "schedule" — placement of the resting entry order at scheduled-signal
 * creation) and close (position exited, always type "active").
 *
 * Note: cancelled scheduled signals do NOT emit OrderOpenContract — their
 * teardown goes through the schedule-event channel (Broker.commitScheduleCancelled).
 */
export type OrderSyncContract = OrderOpenContract | OrderCloseContract;

export default OrderSyncContract;
