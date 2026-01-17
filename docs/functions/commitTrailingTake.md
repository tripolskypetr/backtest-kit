---
title: docs/function/commitTrailingTake
group: docs
---

# commitTrailingTake

```ts
declare function commitTrailingTake(symbol: string, percentShift: number, currentPrice: number): Promise<boolean>;
```

Adjusts the trailing take-profit distance for an active pending signal.

CRITICAL: Always calculates from ORIGINAL TP, not from current trailing TP.
This prevents error accumulation on repeated calls.
Larger percentShift ABSORBS smaller one (updates only towards more conservative TP).

Updates the take-profit distance by a percentage adjustment relative to the ORIGINAL TP distance.
Negative percentShift brings TP closer to entry (more conservative).
Positive percentShift moves TP further from entry (more aggressive).

Absorption behavior:
- First call: sets trailing TP unconditionally
- Subsequent calls: updates only if new TP is MORE CONSERVATIVE (closer to entry)
- For LONG: only accepts LOWER TP (never moves up, closer to entry wins)
- For SHORT: only accepts HIGHER TP (never moves down, closer to entry wins)

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `percentShift` | Percentage adjustment to ORIGINAL TP distance (-100 to 100) |
| `currentPrice` | Current market price to check for intrusion |
