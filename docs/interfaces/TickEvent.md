---
title: docs/api-reference/interface/TickEvent
group: docs
---

# TickEvent

Unified tick event data for report generation.
Contains all information about a tick event regardless of action type.

## Properties

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds (pendingAt for opened/closed events)

### action

```ts
action: "idle" | "opened" | "active" | "closed"
```

Event action type

### symbol

```ts
symbol: string
```

Trading pair symbol (only for non-idle events)

### signalId

```ts
signalId: string
```

Signal ID (only for opened/active/closed)

### position

```ts
position: string
```

Position type (only for opened/active/closed)

### note

```ts
note: string
```

Signal note (only for opened/active/closed)

### currentPrice

```ts
currentPrice: number
```

Current price

### openPrice

```ts
openPrice: number
```

Open price (only for opened/active/closed)

### takeProfit

```ts
takeProfit: number
```

Take profit price (only for opened/active/closed)

### stopLoss

```ts
stopLoss: number
```

Stop loss price (only for opened/active/closed)

### pnl

```ts
pnl: number
```

PNL percentage (only for closed)

### closeReason

```ts
closeReason: string
```

Close reason (only for closed)

### duration

```ts
duration: number
```

Duration in minutes (only for closed)
