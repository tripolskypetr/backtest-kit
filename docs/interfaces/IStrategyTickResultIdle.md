---
title: docs/interface/IStrategyTickResultIdle
group: docs
---

# IStrategyTickResultIdle

Tick result: no active signal, idle state.

## Properties

### action

```ts
action: "idle"
```

Discriminator for type-safe union

### signal

```ts
signal: null
```

No signal in idle state

### strategyName

```ts
strategyName: string
```

Strategy name for tracking idle events

### exchangeName

```ts
exchangeName: string
```

Exchange name for tracking idle events

### frameName

```ts
frameName: string
```

Time frame name for tracking (e.g., "1m", "5m")

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### currentPrice

```ts
currentPrice: number
```

Current VWAP price during idle state

### backtest

```ts
backtest: boolean
```

Whether this event is from backtest mode (true) or live mode (false)

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when this tick result was created (from candle timestamp in backtest or execution context when in live)
