---
title: docs/function/getColumns
group: docs
---

# getColumns

```ts
declare function getColumns(): {
    backtest_columns: ColumnModel<IStrategyTickResultClosed>[];
    heat_columns: ColumnModel<IHeatmapRow>[];
    live_columns: ColumnModel<TickEvent>[];
    partial_columns: ColumnModel<PartialEvent>[];
    breakeven_columns: ColumnModel<BreakevenEvent>[];
    performance_columns: ColumnModel<MetricStats>[];
    risk_columns: ColumnModel<RiskEvent>[];
    schedule_columns: ColumnModel<ScheduledEvent>[];
    strategy_columns: ColumnModel<StrategyEvent>[];
    sync_columns: ColumnModel<SyncEvent>[];
    highest_profit_columns: ColumnModel<HighestProfitEvent>[];
    max_drawdown_columns: ColumnModel<MaxDrawdownEvent>[];
    budget_columns: ColumnModel<BudgetEvent>[];
    walker_pnl_columns: ColumnModel<SignalData>[];
    walker_strategy_columns: ColumnModel<IStrategyResult>[];
};
```

Retrieves a copy of the current column configuration for markdown report generation.

Returns a shallow copy of the current COLUMN_CONFIG to prevent accidental mutations.
Use this to inspect the current column definitions without modifying them.
