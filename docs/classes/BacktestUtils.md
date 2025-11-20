---
title: docs/api-reference/class/BacktestUtils
group: docs
---

# BacktestUtils

## Constructor

```ts
constructor();
```

## Properties

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>
```
