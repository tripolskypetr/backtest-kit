---
title: docs/api-reference/function/runBacktest
group: docs
---

# runBacktest

```ts
declare function runBacktest(symbol: string, timeframes: Date[]): Promise<IBacktestResult>;
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `timeframes` | Array of timestamps to iterate |
