---
title: docs/interface/PartialProfitAvailableNotification
group: docs
---

# PartialProfitAvailableNotification

Partial profit notification.
Emitted when signal reaches profit level milestone (10%, 20%, etc).

## Properties

### type

```ts
type: "partial_profit.available"
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

Unix timestamp in milliseconds when partial profit level was reached

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

### level

```ts
level: PartialLevel
```

Profit level milestone reached (10, 20, 30, etc)

### currentPrice

```ts
currentPrice: number
```

Current market price when milestone was reached

### priceOpen

```ts
priceOpen: number
```

Entry price for the position

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
