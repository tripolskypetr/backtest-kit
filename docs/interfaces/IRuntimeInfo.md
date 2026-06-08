---
title: docs/interface/IRuntimeInfo
group: docs
---

# IRuntimeInfo

Interface for runtime information returned by the RuntimeMetaService.
This includes the symbol being traded, the time range of the backtest, any additional info defined by the strategy,
and contextual information about the exchange, strategy, and frame being used.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### range

```ts
range: IRuntimeRange
```

Time range for the backtest, null if running in live mode

### info

```ts
info: Data
```

Additional runtime information defined by the strategy, can be used for custom monitoring or reporting

### context

```ts
context: { exchangeName: string; strategyName: string; frameName: string; }
```

Contextual information about the current execution environment

### when

```ts
when: Date
```

Timestamp of the current candle or tick

### currentPrice

```ts
currentPrice: number
```

Current market price for the symbol at the time of execution

### backtest

```ts
backtest: boolean
```

Whether the strategy is running in backtest mode
