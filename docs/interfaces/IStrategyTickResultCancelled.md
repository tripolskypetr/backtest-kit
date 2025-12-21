---
title: docs/interface/IStrategyTickResultCancelled
group: docs
---

# IStrategyTickResultCancelled

Tick result: scheduled signal cancelled without opening position.
Occurs when scheduled signal doesn't activate or hits stop loss before entry.

## Properties

### action

```ts
action: "cancelled"
```

Discriminator for type-safe union

### signal

```ts
signal: IScheduledSignalRow
```

Cancelled scheduled signal

### currentPrice

```ts
currentPrice: number
```

Final VWAP price at cancellation

### closeTimestamp

```ts
closeTimestamp: number
```

Unix timestamp in milliseconds when signal cancelled

### strategyName

```ts
strategyName: string
```

Strategy name for tracking

### exchangeName

```ts
exchangeName: string
```

Exchange name for tracking

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### backtest

```ts
backtest: boolean
```

Whether this event is from backtest mode (true) or live mode (false)
