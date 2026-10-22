---
title: docs/function/getPositionPartials
group: docs
---

# getPositionPartials

```ts
declare function getPositionPartials(symbol: string): Promise<ISignalPartial[]>;
```

Returns the list of partial close events for the current pending signal.

Each element represents a partial profit or loss close executed via
commitPartialProfit / commitPartialLoss (or their Cost variants).

Throws if no pending signal exists.
Returns an empty array if no partials were executed yet.

Each entry contains:
- `type` — "profit" or "loss"
- `percent` — percentage of position closed at this partial
- `currentPrice` — execution price of the partial close
- `costBasisAtClose` — accounting cost basis at the moment of this partial
- `entryCountAtClose` — number of DCA entries accumulated at this partial

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
