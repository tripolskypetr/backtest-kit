---
title: docs/type/TFetchOHLCV
group: docs
---

# TFetchOHLCV

```ts
type TFetchOHLCV = (symbol: string, interval: string, since: number, limit: number) => Promise<TRawOHLCV[]>;
```

Raw candle source. since is in milliseconds; must return
up to limit candles starting from the first candle &gt;= since.
