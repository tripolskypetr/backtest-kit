import { IPublicSignalRow, IStrategyPnL } from "../interfaces/Strategy.interface";

/**
 * Single max drawdown event recorded for a position.
 */
export interface MaxDrawdownEvent {
  /** Unix timestamp in milliseconds when the record was set */
  timestamp: number;
  /** Trading pair symbol */
  symbol: string;
  /** Strategy name */
  strategyName: string;
  /** Signal unique identifier */
  signalId: string;
  /** Position direction */
  position: IPublicSignalRow["position"];
  /** Total PNL of the closed position (including all entries and partials) */
  pnl: IStrategyPnL;
  /** Peak profit achieved during the life of this position up to the moment this public signal was created */
  peakProfit: IStrategyPnL;
  /** Maximum drawdown experienced during the life of this position up to the moment this public signal was created */
  maxDrawdown: IStrategyPnL;
  /** Record price reached in the loss direction */
  currentPrice: number;
  /** Effective entry price at the time of the update */
  priceOpen: number;
  /** Take profit price */
  priceTakeProfit: number;
  /** Stop loss price */
  priceStopLoss: number;
  /** Whether the event occurred in backtest mode */
  backtest: boolean;
}

/**
 * Aggregated statistics model for max drawdown events.
 */
export interface MaxDrawdownStatisticsModel {
  /** Full list of recorded events (newest first) */
  eventList: MaxDrawdownEvent[];
  /** Total number of recorded events */
  totalEvents: number;
}
