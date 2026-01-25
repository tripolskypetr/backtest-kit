---
title: docs/interface/IStrategyTickResultScheduled
group: docs
---

# IStrategyTickResultScheduled

Tick result: scheduled signal created, waiting for price to reach entry point.
Triggered when getSignal returns signal with priceOpen specified.

## Properties

### action

```ts
action: "scheduled"
```

Discriminator for type-safe union

### signal

```ts
signal: IPublicSignalRow
```

Scheduled signal waiting for activation

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

Current VWAP price when scheduled signal created

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
