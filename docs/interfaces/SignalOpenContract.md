---
title: docs/interface/SignalOpenContract
group: docs
---

# SignalOpenContract

Signal open sync event.

Emitted when a scheduled (limit order) signal is activated — i.e., the exchange
allowed the framework to enter the position by filling the limit order at priceOpen.

In backtest mode: fired when candle.low &lt;= priceOpen (long) or candle.high &gt;= priceOpen (short).
In live mode: fired when the exchange confirms the limit order is filled.

Consumers use this event to synchronize external order management systems
(e.g., confirm that a limit buy/sell was executed on the exchange).

Consumers:
- External order sync services
- Audit/logging pipelines

## Properties

### action

```ts
action: "signal-open"
```

Discriminator for signal-open action

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of activation (VWAP or candle average)

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

### cost

```ts
cost: number
```

Cost of the position at close (sum of all entry costs)

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

Effective take profit price at activation

### priceStopLoss

```ts
priceStopLoss: number
```

Effective stop loss price at activation

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

Original entry price before any DCA averaging (initial priceOpen)

### scheduledAt

```ts
scheduledAt: number
```

Signal creation timestamp in milliseconds (when scheduled signal was first created)

### pendingAt

```ts
pendingAt: number
```

Position activation timestamp in milliseconds (set at this event)

### totalEntries

```ts
totalEntries: number
```

Total number of DCA entries at the time of close (_entry.length).
1 = no averaging done (only initial entry). 2+ = averaged positions.

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed at the time of close (_partial.length).
0 = no partial closes done. 1+ = partial closes executed.
