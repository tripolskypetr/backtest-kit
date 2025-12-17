---
title: docs/api-reference/interface/ScheduleStatisticsModel
group: docs
---

# ScheduleStatisticsModel

Statistical data calculated from scheduled signals.

Provides metrics for scheduled signal tracking, activation and cancellation analysis.

## Properties

### eventList

```ts
eventList: ScheduledEvent[]
```

Array of all scheduled/opened/cancelled events with full details

### totalEvents

```ts
totalEvents: number
```

Total number of all events (includes scheduled, opened, cancelled)

### totalScheduled

```ts
totalScheduled: number
```

Total number of scheduled signals

### totalOpened

```ts
totalOpened: number
```

Total number of opened signals (activated from scheduled)

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

### activationRate

```ts
activationRate: number
```

Activation rate as percentage (0-100), null if no scheduled signals. Higher is better.

### avgWaitTime

```ts
avgWaitTime: number
```

Average waiting time for cancelled signals in minutes, null if no cancelled signals

### avgActivationTime

```ts
avgActivationTime: number
```

Average waiting time for opened signals in minutes, null if no opened signals
