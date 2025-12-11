---
title: docs/api-reference/interface/ScheduledEvent
group: docs
---

# ScheduledEvent

Unified scheduled signal event data for report generation.
Contains all information about scheduled, opened and cancelled events.

## Properties

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds (scheduledAt for scheduled/cancelled events)

### action

```ts
action: "scheduled" | "opened" | "cancelled"
```

Event action type

### symbol

```ts
symbol: string
```

Trading pair symbol

### signalId

```ts
signalId: string
```

Signal ID

### position

```ts
position: string
```

Position type

### note

```ts
note: string
```

Signal note

### currentPrice

```ts
currentPrice: number
```

Current market price

### priceOpen

```ts
priceOpen: number
```

Scheduled entry price

### takeProfit

```ts
takeProfit: number
```

Take profit price

### stopLoss

```ts
stopLoss: number
```

Stop loss price

### closeTimestamp

```ts
closeTimestamp: number
```

Close timestamp (only for cancelled)

### duration

```ts
duration: number
```

Duration in minutes (only for cancelled/opened)
