---
title: docs/function/trailingStop
group: docs
---

# trailingStop

```ts
declare function trailingStop(symbol: string, percentShift: number, currentPrice: number): Promise<void>;
```

Adjusts the trailing stop-loss distance for an active pending signal.

Updates the stop-loss distance by a percentage adjustment relative to the original SL distance.
Positive percentShift tightens the SL (reduces distance), negative percentShift loosens it.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `percentShift` | Percentage adjustment to SL distance (-100 to 100) |
| `currentPrice` | Current market price to check for intrusion |
