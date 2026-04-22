---
title: docs/interface/MaxDrawdownEvent
group: docs
---

# MaxDrawdownEvent

Single max drawdown event recorded for a position.

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

Total PNL of the closed position (including all entries and partials)

### peakProfit

```ts
peakProfit: IStrategyPnL
```

Peak profit achieved during the life of this position up to the moment this public signal was created

### maxDrawdown

```ts
maxDrawdown: IStrategyPnL
```

Maximum drawdown experienced during the life of this position up to the moment this public signal was created

### currentPrice

```ts
currentPrice: number
```

Record price reached in the loss direction

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
