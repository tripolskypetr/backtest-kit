---
title: docs/interface/SignalScheduledNotification
group: docs
---

# SignalScheduledNotification

Scheduled signal notification.
Emitted when a signal is scheduled for future execution.

## Properties

### type

```ts
type: "signal.scheduled"
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

Unix timestamp in milliseconds when signal was scheduled (scheduledAt)

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

Exchange name where signal will be executed

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

### priceOpen

```ts
priceOpen: number
```

Target entry price for activation

### scheduledAt

```ts
scheduledAt: number
```

Unix timestamp in milliseconds when signal was scheduled

### currentPrice

```ts
currentPrice: number
```

Current market price when signal was scheduled

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the tick result was created (from candle timestamp in backtest or execution context when in live)
