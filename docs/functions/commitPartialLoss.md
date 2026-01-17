---
title: docs/function/commitPartialLoss
group: docs
---

# commitPartialLoss

```ts
declare function commitPartialLoss(symbol: string, percentToClose: number): Promise<boolean>;
```

Executes partial close at loss level (moving toward SL).

Closes a percentage of the active pending position at loss.
Price must be moving toward stop loss (in loss direction).

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `percentToClose` | Percentage of position to close (0-100, absolute value) |
