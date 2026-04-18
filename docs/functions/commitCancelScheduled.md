---
title: docs/function/commitCancelScheduled
group: docs
---

# commitCancelScheduled

```ts
declare function commitCancelScheduled(symbol: string, payload?: Partial<CommitPayload>): Promise<void>;
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
| `payload` | Optional commit payload with id and note |
