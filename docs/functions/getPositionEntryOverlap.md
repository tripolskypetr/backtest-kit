---
title: docs/function/getPositionEntryOverlap
group: docs
---

# getPositionEntryOverlap

```ts
declare function getPositionEntryOverlap(symbol: string, currentPrice: number, ladder?: IPositionOverlapLadder): Promise<boolean>;
```

Checks whether the current price falls within the tolerance zone of any existing DCA entry level.
Use this to prevent duplicate DCA entries at the same price area.

Returns true if currentPrice is within [level - lowerStep, level + upperStep] for any level,
where step = level * percent / 100.
Returns false if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `currentPrice` | Price to check against existing DCA levels |
| `ladder` | Tolerance zone config; percentages in 0–100 format (default: 1.5% up and down) |
