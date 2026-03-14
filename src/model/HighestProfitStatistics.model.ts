import { IPublicSignalRow, IStrategyPnL } from "../interfaces/Strategy.interface";

/**
 * Single highest profit event recorded for a position.
 */
export interface HighestProfitEvent {
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
  /** Unrealized PNL at the time the record was set */
  pnl: IStrategyPnL;
  /** Record price reached in the profit direction */
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
 * Aggregated statistics model for highest profit events.
 */
export interface HighestProfitStatisticsModel {
  /** Full list of recorded events (newest first) */
  eventList: HighestProfitEvent[];
  /** Total number of recorded events */
  totalEvents: number;
}
