---
title: docs/function/getPositionPartialOverlap
group: docs
---

# getPositionPartialOverlap

```ts
declare function getPositionPartialOverlap(symbol: string, currentPrice: number, ladder?: IPositionOverlapLadder): Promise<boolean>;
```

Checks whether the current price falls within the tolerance zone of any existing partial close price.
Use this to prevent duplicate partial closes at the same price area.

Returns true if currentPrice is within [partial.currentPrice - lowerStep, partial.currentPrice + upperStep]
for any partial, where step = partial.currentPrice * percent / 100.
Returns false if no pending signal exists or no partials have been executed yet.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `currentPrice` | Price to check against existing partial close prices |
| `ladder` | Tolerance zone config; percentages in 0–100 format (default: 1.5% up and down) |
