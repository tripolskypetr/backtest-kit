---
title: docs/function/getRemainingCostBasis
group: docs
---

# getRemainingCostBasis

```ts
declare function getRemainingCostBasis(symbol: string): Promise<number>;
```

Returns the remaining cost basis in dollars — how much of the position is
still held (not yet closed by partials). Correctly accounts for DCA entries
between partial closes.

Correctly-named alias for {@link getTotalCostClosed}.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
