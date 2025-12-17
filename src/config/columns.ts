import { backtest_columns } from "../assets/backtest.columns";
import { heat_columns } from "../assets/heat.columns";
import { live_columns } from "../assets/live.columns";
import { partial_columns } from "../assets/partial.columns";
import { performance_columns } from "../assets/performance.columns";
import { risk_columns } from "../assets/risk.columns";
import { schedule_columns } from "../assets/schedule.columns";
import {
  walker_pnl_columns,
  walker_strategy_columns,
} from "../assets/walker.columns";

export const COLUMN_CONFIG = {
  backtest_columns,
  heat_columns,
  live_columns,
  partial_columns,
  performance_columns,
  risk_columns,
  schedule_columns,
  walker_pnl_columns,
  walker_strategy_columns,
};

export const DEFAULT_COLUMNS = Object.freeze({ ...COLUMN_CONFIG });

export type ColumnConfig = typeof COLUMN_CONFIG;
