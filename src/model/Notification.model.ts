import { IStrategyPnL, StrategyName } from "../interfaces/Strategy.interface";
import { PartialLevel } from "../interfaces/Partial.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";

/**
 * Signal opened notification.
 * Emitted when a new trading position is opened.
 */
export interface SignalOpenedNotification {
  /** Discriminator for type-safe union */
  type: "signal.opened";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when signal was opened (pendingAt) */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Take profit target price */
  priceTakeProfit: number;
  /** Stop loss exit price */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Cost of the initial position entry in USD (from signal.cost) */
  cost: number;
  /** Unrealized PNL at the moment of signal open (from signal.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the tick result was created (from candle timestamp in backtest or execution context when in live) */
  createdAt: number;
}

/**
 * Signal closed notification.
 * Emitted when a trading position is closed (TP/SL hit).
 */
export interface SignalClosedNotification {
  /** Discriminator for type-safe union */
  type: "signal.closed";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when signal was closed (closeTimestamp) */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Exit price when position was closed */
  priceClose: number;
  /** Take profit target price */
  priceTakeProfit: number;
  /** Stop loss exit price */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Final PNL at signal close (from data.pnl) */
  pnl: IStrategyPnL;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Why signal closed (time_expired | take_profit | stop_loss | closed) */
  closeReason: string;
  /** Duration of position in minutes (from pendingAt to closeTimestamp) */
  duration: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the tick result was created (from candle timestamp in backtest or execution context when in live) */
  createdAt: number;
}

/**
 * Partial profit notification.
 * Emitted when signal reaches profit level milestone (10%, 20%, etc).
 */
export interface PartialProfitAvailableNotification {
  /** Discriminator for type-safe union */
  type: "partial_profit.available";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when partial profit level was reached */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Profit level milestone reached (10, 20, 30, etc) */
  level: PartialLevel;
  /** Current market price when milestone was reached */
  currentPrice: number;
  /** Entry price for the position */
  priceOpen: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Effective take profit price (with trailing if set) */
  priceTakeProfit: number;
  /** Effective stop loss price (with trailing if set) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Unrealized PNL at the moment this level was reached (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Partial loss notification.
 * Emitted when signal reaches loss level milestone (-10%, -20%, etc).
 */
export interface PartialLossAvailableNotification {
  /** Discriminator for type-safe union */
  type: "partial_loss.available";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when partial loss level was reached */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Loss level milestone reached (10, 20, 30, etc) */
  level: PartialLevel;
  /** Current market price when milestone was reached */
  currentPrice: number;
  /** Entry price for the position */
  priceOpen: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Effective take profit price (with trailing if set) */
  priceTakeProfit: number;
  /** Effective stop loss price (with trailing if set) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Unrealized PNL at the moment this level was reached (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Breakeven available notification.
 * Emitted when signal's stop-loss can be moved to breakeven (entry price).
 */
export interface BreakevenAvailableNotification {
  /** Discriminator for type-safe union */
  type: "breakeven.available";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when breakeven became available */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Current market price when breakeven became available */
  currentPrice: number;
  /** Entry price for the position (breakeven level) */
  priceOpen: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Effective take profit price (with trailing if set) */
  priceTakeProfit: number;
  /** Effective stop loss price (with trailing if set) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Unrealized PNL at the moment breakeven became available (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Partial profit commit notification.
 * Emitted when partial profit action is executed.
 */
export interface PartialProfitCommitNotification {
  /** Discriminator for type-safe union */
  type: "partial_profit.commit";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when partial profit was committed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Percentage of position closed (0-100) */
  percentToClose: number;
  /** Current market price when partial was executed */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price (with trailing if set) */
  priceTakeProfit: number;
  /** Effective stop loss price (with trailing if set) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** PNL at the moment of partial profit commit (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Partial loss commit notification.
 * Emitted when partial loss action is executed.
 */
export interface PartialLossCommitNotification {
  /** Discriminator for type-safe union */
  type: "partial_loss.commit";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when partial loss was committed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Percentage of position closed (0-100) */
  percentToClose: number;
  /** Current market price when partial was executed */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price (with trailing if set) */
  priceTakeProfit: number;
  /** Effective stop loss price (with trailing if set) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** PNL at the moment of partial loss commit (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Breakeven commit notification.
 * Emitted when breakeven action is executed.
 */
export interface BreakevenCommitNotification {
  /** Discriminator for type-safe union */
  type: "breakeven.commit";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when breakeven was committed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Current market price when breakeven was executed */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price (with trailing if set) */
  priceTakeProfit: number;
  /** Effective stop loss price (with trailing if set, after breakeven this equals priceOpen) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** PNL at the moment of breakeven commit (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Average-buy (DCA) commit notification.
 * Emitted when a new averaging entry is added to an open position.
 */
export interface AverageBuyCommitNotification {
  /** Discriminator for type-safe union */
  type: "average_buy.commit";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when the averaging entry was executed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Price at which the new averaging entry was executed */
  currentPrice: number;
  /** Cost of this averaging entry in USD */
  cost: number;
  /** Averaged (effective) entry price after this addition */
  effectivePriceOpen: number;
  /** Total number of DCA entries after this addition */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Original entry price (unchanged by averaging) */
  priceOpen: number;
  /** Effective take profit price (with trailing if set) */
  priceTakeProfit: number;
  /** Effective stop loss price (with trailing if set) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** PNL at the moment of average-buy commit (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Activate scheduled commit notification.
 * Emitted when a scheduled signal is activated by user (without waiting for priceOpen).
 */
export interface ActivateScheduledCommitNotification {
  /** Discriminator for type-safe union */
  type: "activate_scheduled.commit";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when activation was committed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Optional activation identifier (provided when user calls activateScheduled()) */
  activateId?: string;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price */
  priceTakeProfit: number;
  /** Effective stop loss price */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** PNL at the moment of activate-scheduled commit (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Current market price when activation was executed */
  currentPrice: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Trailing stop commit notification.
 * Emitted when trailing stop action is executed.
 */
export interface TrailingStopCommitNotification {
  /** Discriminator for type-safe union */
  type: "trailing_stop.commit";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when trailing stop was committed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Percentage shift of original SL distance (-100 to 100) */
  percentShift: number;
  /** Current market price when trailing stop was executed */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price (with trailing if set) */
  priceTakeProfit: number;
  /** Effective stop loss price after trailing adjustment */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** PNL at the moment of trailing-stop commit (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Trailing take commit notification.
 * Emitted when trailing take action is executed.
 */
export interface TrailingTakeCommitNotification {
  /** Discriminator for type-safe union */
  type: "trailing_take.commit";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when trailing take was committed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Percentage shift of original TP distance (-100 to 100) */
  percentShift: number;
  /** Current market price when trailing take was executed */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price after trailing adjustment */
  priceTakeProfit: number;
  /** Effective stop loss price (with trailing if set) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** PNL at the moment of trailing-take commit (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Signal sync open notification.
 * Emitted when a scheduled (limit order) signal is activated and the position is opened.
 */
export interface SignalSyncOpenNotification {
  /** Discriminator for type-safe union */
  type: "signal_sync.open";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when signal was opened */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Current market price at activation */
  currentPrice: number;
  /** PNL at the moment of opening */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage */
  pnlPercentage: number;
  /** Entry price from PNL calculation */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Cost of the position entry in USD */
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
  /** Original entry price before any DCA averaging */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds */
  pendingAt: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Signal sync close notification.
 * Emitted when an active pending signal is closed (TP/SL hit, time expired, or user-initiated).
 */
export interface SignalSyncCloseNotification {
  /** Discriminator for type-safe union */
  type: "signal_sync.close";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when signal was closed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Current market price at close */
  currentPrice: number;
  /** Final PNL at signal close */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage */
  pnlPercentage: number;
  /** Entry price from PNL calculation */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Effective entry price at close */
  priceOpen: number;
  /** Effective take profit price at close */
  priceTakeProfit: number;
  /** Effective stop loss price at close */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price before any DCA averaging */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds */
  pendingAt: number;
  /** Why the signal was closed (take_profit | stop_loss | time_expired | closed) */
  closeReason: string;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Risk rejection notification.
 * Emitted when a signal is rejected due to risk management rules.
 */
export interface RiskRejectionNotification {
  /** Discriminator for type-safe union */
  type: "risk.rejection";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when signal was rejected */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that attempted to create signal */
  strategyName: StrategyName;
  /** Exchange name where signal was rejected */
  exchangeName: ExchangeName;
  /** Human-readable reason for rejection */
  rejectionNote: string;
  /** Optional unique rejection identifier for tracking */
  rejectionId: string | null;
  /** Number of currently active positions at rejection time */
  activePositionCount: number;
  /** Current market price when rejection occurred */
  currentPrice: number;
  /** Unique signal identifier from pending signal (may be undefined if not provided) */
  signalId: string | undefined;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position (may be undefined if not provided) */
  priceOpen: number | undefined;
  /** Take profit target price */
  priceTakeProfit: number;
  /** Stop loss exit price */
  priceStopLoss: number;
  /** Expected duration in minutes before time_expired */
  minuteEstimatedTime: number;
  /** Optional human-readable description of signal reason */
  signalNote?: string;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Scheduled signal notification.
 * Emitted when a signal is scheduled for future execution.
 */
export interface SignalScheduledNotification {
  /** Discriminator for type-safe union */
  type: "signal.scheduled";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when signal was scheduled (scheduledAt) */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal will be executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Target entry price for activation */
  priceOpen: number;
  /** Take profit target price */
  priceTakeProfit: number;
  /** Stop loss exit price */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Cost of the initial position entry in USD (from signal.cost) */
  cost: number;
  /** Unrealized PNL at the moment of signal scheduled (from signal.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Unix timestamp in milliseconds when signal was scheduled */
  scheduledAt: number;
  /** Current market price when signal was scheduled */
  currentPrice: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Unix timestamp in milliseconds when the tick result was created (from candle timestamp in backtest or execution context when in live) */
  createdAt: number;
}

/**
 * Signal cancelled notification.
 * Emitted when a scheduled signal is cancelled before activation.
 */
export interface SignalCancelledNotification {
  /** Discriminator for type-safe union */
  type: "signal.cancelled";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when signal was cancelled (closeTimestamp) */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was scheduled */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Take profit target price */
  priceTakeProfit: number;
  /** Stop loss exit price */
  priceStopLoss: number;
  /** Entry price for the position */
  priceOpen: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Why signal was cancelled (timeout | price_reject | user) */
  cancelReason: string;
  /** Optional cancellation identifier (provided when user calls cancel()) */
  cancelId: string;
  /** Duration in minutes from scheduledAt to cancellation */
  duration: number;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Unix timestamp in milliseconds when the tick result was created (from candle timestamp in backtest or execution context when in live) */
  createdAt: number;
}

/**
 * Error notification.
 * Emitted for recoverable errors in background tasks.
 */
export interface InfoErrorNotification {
  /** Discriminator for type-safe union */
  type: "error.info";
  /** Unique notification identifier */
  id: string;
  /** Serialized error object with stack trace and metadata */
  error: object;
  /** Human-readable error message */
  message: string;
  /** Always false for error notifications (errors are from live context) */
  backtest: boolean;
}

/**
 * Critical error notification.
 * Emitted for fatal errors requiring process termination.
 */
export interface CriticalErrorNotification {
  /** Discriminator for type-safe union */
  type: "error.critical";
  /** Unique notification identifier */
  id: string;
  /** Serialized error object with stack trace and metadata */
  error: object;
  /** Human-readable error message */
  message: string;
  /** Always false for error notifications (errors are from live context) */
  backtest: boolean;
}

/**
 * Validation error notification.
 * Emitted when risk validation functions throw errors.
 */
export interface ValidationErrorNotification {
  /** Discriminator for type-safe union */
  type: "error.validation";
  /** Unique notification identifier */
  id: string;
  /** Serialized error object with stack trace and metadata */
  error: object;
  /** Human-readable validation error message */
  message: string;
  /** Always false for error notifications (errors are from live context) */
  backtest: boolean;
}

/**
 * Cancel scheduled commit notification.
 * Emitted when a scheduled signal is cancelled before activation.
 */
export interface CancelScheduledCommitNotification {
  /** Discriminator for type-safe union */
  type: "cancel_scheduled.commit";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when cancellation was committed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Optional identifier for the cancellation reason (user-provided) */
  cancelId?: string;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** PNL at the moment of cancellation (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Close pending commit notification.
 * Emitted when a pending signal is closed before position activation.
 */
export interface ClosePendingCommitNotification {
  /** Discriminator for type-safe union */
  type: "close_pending.commit";
  /** Unique notification identifier */
  id: string;
  /** Unix timestamp in milliseconds when close was committed */
  timestamp: number;
  /** Whether this notification is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Optional identifier for the close reason (user-provided) */
  closeId?: string;
  /** Total number of DCA entries (_entry.length). 1 = no averaging. */
  totalEntries: number;
  /** Total number of partial closes executed (_partial.length). 0 = no partial closes done. */
  totalPartials: number;
  /** Original entry price at signal creation (unchanged by DCA averaging) */
  originalPriceOpen: number;
  /** PNL at the moment of close (from data.pnl) */
  pnl: IStrategyPnL;
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price from PNL calculation (effective price adjusted with slippage and fees) */
  pnlPriceOpen: number;
  /** Exit price from PNL calculation (adjusted with slippage and fees) */
  pnlPriceClose: number;
  /** Absolute profit/loss in USD */
  pnlCost: number;
  /** Total invested capital in USD */
  pnlEntries: number;
  /** Optional human-readable description of signal reason */
  note?: string;
  /** Unix timestamp in milliseconds when the notification was created */
  createdAt: number;
}

/**
 * Root discriminated union of all notification types.
 * Type discrimination is done via the `type` field.
 *
 * @example
 * ```typescript
 * function handleNotification(notification: NotificationModel) {
 *   switch (notification.type) {
 *     case "signal.opened":
 *       console.log(`Position opened: ${notification.signalId}`);
 *       break;
 *     case "signal.closed":
 *       console.log(`PNL: ${notification.pnlPercentage}%`);
 *       break;
 *     case "partial.loss":
 *       if (notification.level >= 30) {
 *         console.warn("High loss alert!");
 *       }
 *       break;
 *     case "risk.rejection":
 *       console.error(`Signal rejected: ${notification.rejectionNote}`);
 *       break;
 *   }
 * }
 * ```
 */
export type NotificationModel =
  | SignalOpenedNotification
  | SignalClosedNotification
  | PartialProfitAvailableNotification
  | PartialLossAvailableNotification
  | BreakevenAvailableNotification
  | PartialProfitCommitNotification
  | PartialLossCommitNotification
  | BreakevenCommitNotification
  | AverageBuyCommitNotification
  | ActivateScheduledCommitNotification
  | TrailingStopCommitNotification
  | TrailingTakeCommitNotification
  | CancelScheduledCommitNotification
  | ClosePendingCommitNotification
  | SignalSyncOpenNotification
  | SignalSyncCloseNotification
  | RiskRejectionNotification
  | SignalScheduledNotification
  | SignalCancelledNotification
  | InfoErrorNotification
  | CriticalErrorNotification
  | ValidationErrorNotification;

export default NotificationModel;
