---
title: docs/function/commitPartialLoss
group: docs
---

# commitPartialLoss

```ts
declare function commitPartialLoss(symbol: string, dto: number | IPartialDto): Promise<boolean>;
```

Executes partial close at loss level (moving toward SL).

Closes a percentage of the active pending position at loss.
Price must be moving toward stop loss (in loss direction).

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `dto` | Percentage of the REMAINING position to close (0-100) as a number, or { percent, note } to store a note on the partial row |
