---
title: docs/function/warmCandles
group: docs
---

# warmCandles

```ts
declare function warmCandles(params: ICacheCandlesParams): Promise<void>;
```

Pre-caches candles for a date range into persist storage.
Downloads all candles matching the interval from `from` to `to`.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `params` | Cache parameters |
