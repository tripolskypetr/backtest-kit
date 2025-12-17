---
title: docs/api-reference/interface/PartialStatisticsModel
group: docs
---

# PartialStatisticsModel

Statistical data calculated from partial profit/loss events.

Provides metrics for partial profit/loss milestone tracking.

## Properties

### eventList

```ts
eventList: PartialEvent[]
```

Array of all profit/loss events with full details

### totalEvents

```ts
totalEvents: number
```

Total number of all events (includes profit, loss)

### totalProfit

```ts
totalProfit: number
```

Total number of profit events

### totalLoss

```ts
totalLoss: number
```

Total number of loss events
