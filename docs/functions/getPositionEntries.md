---
title: docs/function/getPositionEntries
group: docs
---

# getPositionEntries

```ts
declare function getPositionEntries(symbol: string): Promise<ISignalEntry[]>;
```

Returns the list of DCA entry prices and costs for the current pending signal.

Each element represents a single position entry — the initial open or a subsequent
DCA entry added via commitAverageBuy.

Throws if no pending signal exists.
Returns a single-element array if no DCA entries were made.

Each entry contains:
- `price` — execution price of this entry
- `cost` — dollar cost allocated to this entry (e.g. 100 for $100)

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
