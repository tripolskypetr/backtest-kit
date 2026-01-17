---
title: docs/function/commitCancel
group: docs
---

# commitCancel

```ts
declare function commitCancel(symbol: string, cancelId?: string): Promise<void>;
```

Cancels the scheduled signal without stopping the strategy.

Clears the scheduled signal (waiting for priceOpen activation).
Does NOT affect active pending signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `cancelId` | Optional cancellation ID for tracking user-initiated cancellations |
