---
title: docs/interface/SyncEvent
group: docs
---

# SyncEvent

Unified sync event data for markdown report generation.
Contains all information about signal lifecycle sync events.

## Properties

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds

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

### exchangeName

```ts
exchangeName: string
```

Exchange name

### frameName

```ts
frameName: string
```

Frame name (empty for live)

### signalId

```ts
signalId: string
```

Signal unique identifier

### action

```ts
action: SyncActionType
```

Sync action type

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of this event

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Entry price at which the limit order was filled

### priceTakeProfit

```ts
priceTakeProfit: number
```

Effective take profit price

### priceStopLoss

```ts
priceStopLoss: number
```

Effective stop loss price

### originalPriceTakeProfit

```ts
originalPriceTakeProfit: number
```

Original take profit price before any trailing adjustments

### originalPriceStopLoss

```ts
originalPriceStopLoss: number
```

Original stop loss price before any trailing adjustments

### originalPriceOpen

```ts
originalPriceOpen: number
```

Original entry price before any DCA averaging

### scheduledAt

```ts
scheduledAt: number
```

Signal creation timestamp in milliseconds

### pendingAt

```ts
pendingAt: number
```

Position activation timestamp in milliseconds

### totalEntries

```ts
totalEntries: number
```

Total number of DCA entries

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed

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

### closeReason

```ts
closeReason: StrategyCloseReason
```

Why the signal was closed (signal-close only)

### backtest

```ts
backtest: boolean
```

Whether this event is from backtest mode

### createdAt

```ts
createdAt: string
```

ISO timestamp string when event was created
