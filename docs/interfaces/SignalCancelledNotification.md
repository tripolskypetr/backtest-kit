---
title: docs/interface/SignalCancelledNotification
group: docs
---

# SignalCancelledNotification

Signal cancelled notification.
Emitted when a scheduled signal is cancelled before activation.

## Properties

### type

```ts
type: "signal.cancelled"
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

Unix timestamp in milliseconds when signal was cancelled (closeTimestamp)

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

Exchange name where signal was scheduled

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4)

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

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

### priceOpen

```ts
priceOpen: number
```

Entry price for the position

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

Original entry price at signal creation (unchanged by DCA averaging)

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

### cancelReason

```ts
cancelReason: string
```

Why signal was cancelled (timeout &vert; price_reject | user)

### cancelId

```ts
cancelId: string
```

Optional cancellation identifier (provided when user calls cancel())

### duration

```ts
duration: number
```

Duration in minutes from scheduledAt to cancellation

### scheduledAt

```ts
scheduledAt: number
```

Signal creation timestamp in milliseconds (when signal was first created/scheduled)

### pendingAt

```ts
pendingAt: number
```

Pending timestamp in milliseconds (when position became pending/active at priceOpen)

### note

```ts
note: string
```

Optional human-readable description of signal reason

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the tick result was created (from candle timestamp in backtest or execution context when in live)
