---
title: docs/function/getStrategyStatus
group: docs
---

# getStrategyStatus

```ts
declare function getStrategyStatus(symbol: string): Promise<StrategyStatus>;
```

Returns the in-memory deferred strategy-state snapshot for the current iteration: the queued
createSignal, commit queue and deferred user-action flags, plus the current pending signal id.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
