---
title: docs/interface/SignalCloseContract
group: docs
---

# SignalCloseContract

Signal close sync event.

Emitted when an active pending signal is closed for any reason:
take profit hit, stop loss hit, time expired, or user-initiated close.

Consumers use this event to synchronize external order management systems
(e.g., cancel remaining OCO orders, record final PNL in external DB).

Consumers:
- External order sync services
- Audit/logging pipelines

## Properties

### action

```ts
action: "signal-close"
```

Discriminator for signal-close action

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of close

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

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Effective entry price at time of close (may differ from priceOpen after DCA averaging)

### priceTakeProfit

```ts
priceTakeProfit: number
```

Effective take profit price at close (may differ from original after trailing)

### priceStopLoss

```ts
priceStopLoss: number
```

Effective stop loss price at close (may differ from original after trailing)

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

Signal creation timestamp in milliseconds

### pendingAt

```ts
pendingAt: number
```

Position activation timestamp in milliseconds

### closeReason

```ts
closeReason: StrategyCloseReason
```

Why the signal was closed

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
