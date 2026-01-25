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

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the tick result was created (from candle timestamp in backtest or execution context when in live)
