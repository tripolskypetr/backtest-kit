---
title: docs/api-reference/function/reduce
group: docs
---

# reduce

```ts
declare function reduce<T>(symbol: string, timeframes: Date[], callback: ReduceCallback<T>, initialValue: T): Promise<IReduceResult<T>>;
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `timeframes` | Array of timestamps to iterate |
| `callback` | Reducer callback |
| `initialValue` | Initial accumulator value |
