---
title: docs/api-reference/function/getDate
group: docs
---

# getDate

```ts
declare function getDate(): Promise<Date>;
```

Gets the current date from execution context.

In backtest mode: returns the current timeframe date being processed
In live mode: returns current real-time date
