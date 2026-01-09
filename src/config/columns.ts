import { backtest_columns } from "../assets/backtest.columns";
import { heat_columns } from "../assets/heat.columns";
import { live_columns } from "../assets/live.columns";
import { partial_columns } from "../assets/partial.columns";
import { breakeven_columns } from "../assets/breakeven.columns";
import { performance_columns } from "../assets/performance.columns";
import { risk_columns } from "../assets/risk.columns";
import { schedule_columns } from "../assets/schedule.columns";
import {
  walker_pnl_columns,
  walker_strategy_columns,
} from "../assets/walker.columns";

/**
 * Mapping of available table/markdown reports to their column definitions.
 *
 * Each property references a column definition object imported from
 * `src/assets/*.columns`. These are used by markdown/report generators
 * (backtest, live, schedule, risk, heat, performance, partial, walker).
 */
export const COLUMN_CONFIG = {
  /** Columns used in backtest markdown tables and reports */
  backtest_columns,
  /** Columns used by heatmap / heat reports */
  heat_columns,
  /** Columns for live trading reports and logs */
  live_columns,
  /** Columns for partial-results / incremental reports */
  partial_columns,
  /** Columns for breakeven protection events */
  breakeven_columns,
  /** Columns for performance summary reports */
  performance_columns,
  /** Columns for risk-related reports */
  risk_columns,
  /** Columns for scheduled report output */
  schedule_columns,
  /** Walker: PnL summary columns */
  walker_pnl_columns,
  /** Walker: strategy-level summary columns */
  walker_strategy_columns,
};

/**
 * Immutable default columns mapping used across the application.
 * Use `DEFAULT_COLUMNS` when you need a read-only reference to the
 * canonical column configuration.
 */
export const DEFAULT_COLUMNS = Object.freeze({ ...COLUMN_CONFIG });

/**
 * Type for the column configuration object.
 */
export type ColumnConfig = typeof COLUMN_CONFIG;
