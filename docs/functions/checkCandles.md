---
title: docs/function/checkCandles
group: docs
---

# checkCandles

```ts
declare function checkCandles(params: ICheckCandlesParams): Promise<void>;
```

Checks cached candle timestamps for correct interval alignment.
Reads JSON files directly from persist storage without using abstractions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `params` | Validation parameters |
