---
title: docs/interface/DoneContract
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

### frameName

```ts
frameName: string
```

frameName - Name of the frame (empty string for live mode)

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

### when

```ts
when: Date
```

Completion time as a `Date` instance.

- Backtest mode: virtual execution time — the last processed candle
  timestamp from `TimeMetaService`, falling back to the frame's planned
  start date if no candle was processed.
- Live mode: time of the last processed tick from `TimeMetaService`.
