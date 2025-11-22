---
title: docs/api-reference/interface/DoneContract
group: docs
---

# DoneContract

Contract for background execution completion events.

Emitted when Live.background() or Backtest.background() completes execution.
Contains metadata about the completed execution context.

## Properties

### exchangeName

```ts
exchangeName: string
```

exchangeName - Name of the exchange used in execution

### strategyName

```ts
strategyName: string
```

strategyName - Name of the strategy that completed

### backtest

```ts
backtest: boolean
```

backtest - True if backtest mode, false if live mode

### symbol

```ts
symbol: string
```

symbol - Trading symbol (e.g., "BTCUSDT")
