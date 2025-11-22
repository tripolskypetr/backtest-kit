---
title: docs/api-reference/interface/IStrategy
group: docs
---

# IStrategy

Strategy interface implemented by ClientStrategy.
Defines core strategy execution methods.

## Properties

### tick

```ts
tick: (symbol: string) => Promise<IStrategyTickResult>
```

Single tick of strategy execution with VWAP monitoring.
Checks for signal generation (throttled) and TP/SL conditions.

### backtest

```ts
backtest: (candles: ICandleData[]) => Promise<IStrategyTickResultClosed>
```

Fast backtest using historical candles.
Iterates through candles, calculates VWAP, checks TP/SL on each candle.

### stop

```ts
stop: (symbol: string) => Promise<void>
```

Stops the strategy from generating new signals.

Sets internal flag to prevent getSignal from being called on subsequent ticks.
Does NOT force-close active pending signals - they continue monitoring until natural closure (TP/SL/time_expired).

Use case: Graceful shutdown in live trading mode without abandoning open positions.
