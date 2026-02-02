---
title: docs/interface/BreakevenCommitNotification
group: docs
---

# BreakevenCommitNotification

Breakeven commit notification.
Emitted when breakeven action is executed.

## Properties

### type

```ts
type: "breakeven.commit"
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

Unix timestamp in milliseconds when breakeven was committed

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

### currentPrice

```ts
currentPrice: number
```

Current market price when breakeven was executed

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the notification was created
