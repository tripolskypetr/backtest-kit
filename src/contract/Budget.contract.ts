import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import type { BudgetName, IBudgetHistoryRow } from "../classes/Budget";

/**
 * Contract for budget journal rows emitted by the framework.
 * One event per row inserted into a budget journal (`reserve`, `release`,
 * `reject`, `deposit`, `withdraw`) by `BudgetLocalInstance` / `BudgetPersistInstance`.
 * The record key (strategy, exchange, frame, backtest) plus the budget name
 * identify the journal; the row carries the balance AFTER it at insertion time.
 * Fed into `budget.jsonl` (`BudgetReportService`) and the `budget` markdown
 * report (`BudgetMarkdownService`); user code can listen via `listenBudget`.
 */
export interface BudgetContract {
  /** Strategy name of the run (part of the record key) */
  strategyName: StrategyName;
  /** Exchange name of the run (part of the record key) */
  exchangeName: ExchangeName;
  /** Frame name of the run (part of the record key; empty string in live mode) */
  frameName: FrameName;
  /** Backtest or live record (part of the record key) */
  backtest: boolean;
  /** Budget name — the bucket inside the record */
  name: BudgetName;
  /** Symbol that authored the row, null when the call had no symbol */
  symbol: string | null;
  /** Logical time of the action (the row's `timestamp`, milliseconds since epoch) */
  timestamp: number;
  /**
   * Logical time as a `Date` instance. Backtest mode: virtual execution time;
   * live mode: wall-clock time of the call. Always equal to `new Date(timestamp)`.
   */
  when: Date;
  /** The inserted journal row (a copy) with the balance after it */
  row: IBudgetHistoryRow;
}

export default BudgetContract;
