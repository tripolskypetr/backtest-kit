---
title: docs/function/addStrategySchema
group: docs
---

# addStrategySchema

```ts
declare function addStrategySchema(strategySchema: IStrategySchema): void;
```

Registers a trading strategy in the framework.

The strategy will be validated for:
- Signal validation (prices, TP/SL logic, timestamps)
- Interval throttling (prevents signal spam)
- Crash-safe persistence in live mode

## Parameters

| Parameter | Description |
|-----------|-------------|
| `strategySchema` | Strategy configuration object |
