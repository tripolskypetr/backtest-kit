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

Single tick of strategy execution with VWAP monitoring

### backtest

```ts
backtest: (candles: ICandleData[]) => Promise<IStrategyTickResultClosed>
```

Fast backtest using historical candles
