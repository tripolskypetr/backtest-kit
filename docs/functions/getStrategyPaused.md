---
title: docs/function/getStrategyPaused
group: docs
---

# getStrategyPaused

```ts
declare function getStrategyPaused(symbol: string): Promise<boolean>;
```

Returns the paused state of the strategy.

While paused the strategy opens nothing new: getSignal is not called and a queued
createSignal DTO is held until resume. Existing pending/scheduled signals keep
being monitored and close normally.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
