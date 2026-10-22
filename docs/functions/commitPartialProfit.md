---
title: docs/function/commitPartialProfit
group: docs
---

# commitPartialProfit

```ts
declare function commitPartialProfit(symbol: string, dto: number | IPartialDto): Promise<boolean>;
```

Executes partial close at profit level (moving toward TP).

Closes a percentage of the active pending position at profit.
Price must be moving toward take profit (in profit direction).

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `dto` | Percentage of the REMAINING position to close (0-100) as a number, or { percent, note } to store a note on the partial row |
