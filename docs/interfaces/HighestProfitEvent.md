---
title: docs/interface/HighestProfitEvent
group: docs
---

# HighestProfitEvent

Single highest profit event recorded for a position.

## Properties

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds when the record was set

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

Signal unique identifier

### position

```ts
position: "long" | "short"
```

Position direction

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL at the time the record was set

### currentPrice

```ts
currentPrice: number
```

Record price reached in the profit direction

### priceOpen

```ts
priceOpen: number
```

Effective entry price at the time of the update

### priceTakeProfit

```ts
priceTakeProfit: number
```

Take profit price

### priceStopLoss

```ts
priceStopLoss: number
```

Stop loss price

### backtest

```ts
backtest: boolean
```

Whether the event occurred in backtest mode
