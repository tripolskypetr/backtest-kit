---
title: docs/function/commitClosePending
group: docs
---

# commitClosePending

```ts
declare function commitClosePending(symbol: string, closeId?: string): Promise<void>;
```

Closes the pending signal without stopping the strategy.

Clears the pending signal (active position).
Does NOT affect scheduled signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `closeId` | Optional close ID for tracking user-initiated closes |
