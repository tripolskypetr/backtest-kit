---
title: docs/function/trailingProfit
group: docs
---

# trailingProfit

```ts
declare function trailingProfit(symbol: string, percentShift: number, currentPrice: number): Promise<void>;
```

Adjusts the trailing take-profit distance for an active pending signal.

Updates the take-profit distance by a percentage adjustment relative to the original TP distance.
Negative percentShift brings TP closer to entry, positive percentShift moves it further.
Once direction is set on first call, subsequent calls must continue in same direction.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `percentShift` | Percentage adjustment to TP distance (-100 to 100) |
| `currentPrice` | Current market price to check for intrusion |
