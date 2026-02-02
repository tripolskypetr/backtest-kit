---
title: docs/interface/BreakevenAvailableNotification
group: docs
---

# BreakevenAvailableNotification

Breakeven available notification.
Emitted when signal's stop-loss can be moved to breakeven (entry price).

## Properties

### type

```ts
type: "breakeven.available"
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

Unix timestamp in milliseconds when breakeven became available

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

Current market price when breakeven became available

### priceOpen

```ts
priceOpen: number
```

Entry price for the position (breakeven level)

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the notification was created
