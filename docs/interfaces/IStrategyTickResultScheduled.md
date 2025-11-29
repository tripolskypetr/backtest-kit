---
title: docs/api-reference/interface/IStrategyTickResultScheduled
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
signal: IScheduledSignalRow
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
