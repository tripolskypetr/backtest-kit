---
title: docs/api-reference/function/getColumns
group: docs
---

# getColumns

```ts
declare function getColumns(): {
    backtest_columns: ColumnModel<IStrategyTickResultClosed>[];
    heat_columns: ColumnModel<IHeatmapRow>[];
    live_columns: ColumnModel<TickEvent>[];
    partial_columns: ColumnModel<PartialEvent>[];
    performance_columns: ColumnModel<MetricStats>[];
    risk_columns: ColumnModel<RiskEvent>[];
    schedule_columns: ColumnModel<ScheduledEvent>[];
    walker_pnl_columns: ColumnModel<SignalData$1>[];
    walker_strategy_columns: ColumnModel<IStrategyResult>[];
};
```

Retrieves a copy of the current column configuration.

Returns a shallow copy of the current COLUMN_CONFIG to prevent accidental mutations.
Use this to inspect the current column definitions without modifying them.
