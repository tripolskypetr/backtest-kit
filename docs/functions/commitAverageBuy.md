---
title: docs/function/commitAverageBuy
group: docs
---

# commitAverageBuy

```ts
declare function commitAverageBuy(symbol: string, dto?: number | IAverageBuyDto): Promise<boolean>;
```

Adds a new DCA entry to the active pending signal.

Adds a new averaging entry at the current market price to the position's
entry history. Updates effectivePriceOpen (mean of all entries) and emits
an average-buy commit event.

Automatically detects backtest/live mode from execution context.
Automatically fetches current price via getAveragePrice.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `dto` | Dollar amount of the new entry as a number (defaults to CC_POSITION_ENTRY_COST), or { cost, note } to store a note on the entry row |
