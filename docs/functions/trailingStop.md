---
title: docs/function/trailingStop
group: docs
---

# trailingStop

```ts
declare function trailingStop(symbol: string, percentShift: number, currentPrice: number): Promise<boolean>;
```

Adjusts the trailing stop-loss distance for an active pending signal.

CRITICAL: Always calculates from ORIGINAL SL, not from current trailing SL.
This prevents error accumulation on repeated calls.
Larger percentShift ABSORBS smaller one (updates only towards better protection).

Updates the stop-loss distance by a percentage adjustment relative to the ORIGINAL SL distance.
Negative percentShift tightens the SL (reduces distance, moves closer to entry).
Positive percentShift loosens the SL (increases distance, moves away from entry).

Absorption behavior:
- First call: sets trailing SL unconditionally
- Subsequent calls: updates only if new SL is BETTER (protects more profit)
- For LONG: only accepts HIGHER SL (never moves down, closer to entry wins)
- For SHORT: only accepts LOWER SL (never moves up, closer to entry wins)

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `percentShift` | Percentage adjustment to ORIGINAL SL distance (-100 to 100) |
| `currentPrice` | Current market price to check for intrusion |
