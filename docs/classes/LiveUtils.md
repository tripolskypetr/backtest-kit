---
title: docs/api-reference/class/LiveUtils
group: docs
---

# LiveUtils

## Constructor

```ts
constructor();
```

## Properties

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>
```
