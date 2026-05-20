---
title: docs/function/checkCandles
group: docs
---

# checkCandles

```ts
declare function checkCandles(params: ICheckCandlesParams): Promise<void>;
```

Checks cached candle presence via the persist adapter.
Issues one ranged read; adapter-side `hasValue` covers each expected timestamp,
so a single missing or unaligned candle yields a miss without loading the whole dataset.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `params` | Validation parameters |
