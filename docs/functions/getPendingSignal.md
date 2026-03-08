---
title: docs/function/getPendingSignal
group: docs
---

# getPendingSignal

```ts
declare function getPendingSignal(symbol: string): Promise<IPublicSignalRow>;
```

Returns the currently active pending signal for the strategy.
If no active signal exists, returns null.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
