---
title: docs/api-reference/interface/PartialEvent
group: docs
---

# PartialEvent

Unified partial profit/loss event data for report generation.
Contains all information about profit and loss level milestones.

## Properties

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds

### action

```ts
action: "profit" | "loss"
```

Event action type (profit or loss)

### symbol

```ts
symbol: string
```

Trading pair symbol

### strategyName

```ts
strategyName: string
```

Strategy name

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

### currentPrice

```ts
currentPrice: number
```

Current market price

### level

```ts
level: PartialLevel
```

Profit/loss level reached (10, 20, 30, etc)

### backtest

```ts
backtest: boolean
```

True if backtest mode, false if live mode
