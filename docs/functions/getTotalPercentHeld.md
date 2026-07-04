---
title: docs/function/getTotalPercentHeld
group: docs
---

# getTotalPercentHeld

```ts
declare function getTotalPercentHeld(symbol: string): Promise<number>;
```

Returns the percentage of the position currently held (not yet closed by partials).
100 = nothing has been closed (full position), 0 = fully closed.
Correctly accounts for DCA entries between partial closes.

Correctly-named alias for {@link getTotalPercentClosed}.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
