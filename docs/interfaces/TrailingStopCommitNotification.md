---
title: docs/interface/TrailingStopCommitNotification
group: docs
---

# TrailingStopCommitNotification

Trailing stop commit notification.
Emitted when trailing stop action is executed.

## Properties

### type

```ts
type: "trailing_stop.commit"
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

Unix timestamp in milliseconds when trailing stop was committed

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

Percentage shift of original SL distance (-100 to 100)

### currentPrice

```ts
currentPrice: number
```

Current market price when trailing stop was executed
