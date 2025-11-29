---
title: docs/api-reference/interface/ScheduleStatistics
group: docs
---

# ScheduleStatistics

Statistical data calculated from scheduled signals.

Provides metrics for scheduled signal tracking and cancellation analysis.

## Properties

### eventList

```ts
eventList: ScheduledEvent[]
```

Array of all scheduled/cancelled events with full details

### totalEvents

```ts
totalEvents: number
```

Total number of all events (includes scheduled, cancelled)

### totalScheduled

```ts
totalScheduled: number
```

Total number of scheduled signals

### totalCancelled

```ts
totalCancelled: number
```

Total number of cancelled signals

### cancellationRate

```ts
cancellationRate: number
```

Cancellation rate as percentage (0-100), null if no scheduled signals. Lower is better.

### avgWaitTime

```ts
avgWaitTime: number
```

Average waiting time for cancelled signals in minutes, null if no cancelled signals
