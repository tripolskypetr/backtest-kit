---
title: docs/interface/PartialEvent
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

### priceOpen

```ts
priceOpen: number
```

Entry price for the position

### priceTakeProfit

```ts
priceTakeProfit: number
```

Take profit target price

### priceStopLoss

```ts
priceStopLoss: number
```

Stop loss exit price

### originalPriceTakeProfit

```ts
originalPriceTakeProfit: number
```

Original take profit price set at signal creation

### originalPriceStopLoss

```ts
originalPriceStopLoss: number
```

Original stop loss price set at signal creation

### partialExecuted

```ts
partialExecuted: number
```

Total executed percentage from partial closes

### note

```ts
note: string
```

Human-readable description of signal reason

### backtest

```ts
backtest: boolean
```

True if backtest mode, false if live mode
