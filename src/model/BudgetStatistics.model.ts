import type { BudgetName, IBudgetHistoryRow } from "../classes/Budget";

/**
 * Single budget journal row recorded by the markdown report, with the record
 * key it belongs to. The row is the journal entry as it was at insertion
 * (type, amount, ids, balance after the row); a later insert at an earlier
 * logical time recomputes balances in the journal, not in this event list.
 */
export type BudgetEvent = IBudgetHistoryRow & {
  /** Strategy name of the run */
  strategyName: string;
  /** Exchange name of the run */
  exchangeName: string;
  /** Frame name of the run (empty string in live mode) */
  frameName: string;
  /** Whether the row was written in backtest mode */
  backtest: boolean;
  /** Budget name */
  name: BudgetName;
};

/**
 * Aggregated statistics model for budget journal events.
 */
export interface BudgetStatisticsModel {
  /** Full list of recorded rows (newest first by arrival) */
  eventList: BudgetEvent[];
  /** Total number of recorded rows */
  totalEvents: number;
  /** Number of `reject` rows (refused reserves / withdrawals) */
  totalRejects: number;
  /** Number of `reserve` rows that carried an overdraft mark when inserted */
  totalOverdrafts: number;
}
