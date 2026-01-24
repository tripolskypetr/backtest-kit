---
title: docs/interface/StrategyStatisticsModel
group: docs
---

# StrategyStatisticsModel

Statistical data calculated from strategy events.

Provides metrics for strategy action tracking.

## Properties

### eventList

```ts
eventList: StrategyEvent[]
```

Array of all strategy events with full details

### totalEvents

```ts
totalEvents: number
```

Total number of strategy events

### cancelScheduledCount

```ts
cancelScheduledCount: number
```

Count of cancel-scheduled events

### closePendingCount

```ts
closePendingCount: number
```

Count of close-pending events

### partialProfitCount

```ts
partialProfitCount: number
```

Count of partial-profit events

### partialLossCount

```ts
partialLossCount: number
```

Count of partial-loss events

### trailingStopCount

```ts
trailingStopCount: number
```

Count of trailing-stop events

### trailingTakeCount

```ts
trailingTakeCount: number
```

Count of trailing-take events

### breakevenCount

```ts
breakevenCount: number
```

Count of breakeven events
