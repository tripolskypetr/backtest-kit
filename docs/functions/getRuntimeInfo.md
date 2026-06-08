---
title: docs/function/getRuntimeInfo
group: docs
---

# getRuntimeInfo

```ts
declare function getRuntimeInfo<Data extends RuntimeData = RuntimeData>(): Promise<IRuntimeInfo<Data>>;
```

Gets runtime information about the current execution environment.

This includes details such as the current symbol, exchange, timeframe, strategy, and whether it's a backtest or live run.
