---
title: docs/interface/PartialProfitCommitNotification
group: docs
---

# PartialProfitCommitNotification

Partial profit commit notification.
Emitted when partial profit action is executed.

## Properties

### type

```ts
type: "partial_profit.commit"
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

Unix timestamp in milliseconds when partial profit was committed

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

### percentToClose

```ts
percentToClose: number
```

Percentage of position closed (0-100)

### currentPrice

```ts
currentPrice: number
```

Current market price when partial was executed
