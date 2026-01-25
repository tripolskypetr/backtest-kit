---
title: docs/interface/TrailingTakeCommitNotification
group: docs
---

# TrailingTakeCommitNotification

Trailing take commit notification.
Emitted when trailing take action is executed.

## Properties

### type

```ts
type: "trailing_take.commit"
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

Unix timestamp in milliseconds when trailing take was committed

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

### percentShift

```ts
percentShift: number
```

Percentage shift of original TP distance (-100 to 100)

### currentPrice

```ts
currentPrice: number
```

Current market price when trailing take was executed
