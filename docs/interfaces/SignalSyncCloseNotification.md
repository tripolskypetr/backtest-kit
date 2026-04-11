---
title: docs/interface/SignalSyncCloseNotification
group: docs
---

# SignalSyncCloseNotification

Signal sync close notification.
Emitted when an active pending signal is closed (TP/SL hit, time expired, or user-initiated).

## Properties

### type

```ts
type: "signal_sync.close"
```

Discriminator for type-safe union

### id

```ts
id: string
```

Unique notification identifier

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds when signal was closed

### backtest

```ts
backtest: boolean
```

Whether this notification is from backtest mode (true) or live mode (false)

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### strategyName

```ts
strategyName: string
```

Strategy name that generated this signal

### exchangeName

```ts
exchangeName: string
```

Exchange name where signal was executed

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4)

### currentPrice

```ts
currentPrice: number
```

Current market price at close

### pnl

```ts
pnl: IStrategyPnL
```

Final PNL at signal close

### pnlPercentage

```ts
pnlPercentage: number
```

Profit/loss as percentage

### pnlPriceOpen

```ts
pnlPriceOpen: number
```

Entry price from PNL calculation

### pnlPriceClose

```ts
pnlPriceClose: number
```

Exit price from PNL calculation

### pnlCost

```ts
pnlCost: number
```

Absolute profit/loss in USD

### pnlEntries

```ts
pnlEntries: number
```

Total invested capital in USD

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Effective entry price at close

### priceTakeProfit

```ts
priceTakeProfit: number
```

Effective take profit price at close

### priceStopLoss

```ts
priceStopLoss: number
```

Effective stop loss price at close

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

### totalEntries

```ts
totalEntries: number
```

Total number of DCA entries (_entry.length). 1 = no averaging.

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed (_partial.length). 0 = no partial closes done.

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
closeReason: string
```

Why the signal was closed (take_profit &vert; stop_loss | time_expired | closed)

### note

```ts
note: string
```

Optional human-readable description of signal reason

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the notification was created
