---
title: docs/function/getDefaultColumns
group: docs
---

# getDefaultColumns

```ts
declare function getDefaultColumns(): Readonly<{
    backtest_columns: ColumnModel<IStrategyTickResultClosed>[];
    heat_columns: ColumnModel<IHeatmapRow>[];
    live_columns: ColumnModel<TickEvent>[];
    partial_columns: ColumnModel<PartialEvent>[];
    breakeven_columns: ColumnModel<BreakevenEvent>[];
    performance_columns: ColumnModel<MetricStats>[];
    risk_columns: ColumnModel<RiskEvent>[];
    schedule_columns: ColumnModel<ScheduledEvent>[];
    strategy_columns: ColumnModel<StrategyEvent>[];
    walker_pnl_columns: ColumnModel<SignalData$1>[];
    walker_strategy_columns: ColumnModel<IStrategyResult>[];
}>;
```

Retrieves the default column configuration object for markdown report generation.

Returns a reference to the default column definitions with all preset values.
Use this to see what column options are available and their default definitions.
