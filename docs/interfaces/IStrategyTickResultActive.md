---
title: docs/api-reference/interface/IStrategyTickResultActive
group: docs
---

# IStrategyTickResultActive

Tick result: signal is being monitored.
Waiting for TP/SL or time expiration.

## Properties

### action

```ts
action: "active"
```

Discriminator for type-safe union

### signal

```ts
signal: ISignalRow
```

Currently monitored signal

### currentPrice

```ts
currentPrice: number
```

Current VWAP price for monitoring

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
