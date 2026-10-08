---
title: docs/type/TRawOHLCV
group: docs
---

# TRawOHLCV

```ts
type TRawOHLCV = (number | undefined)[];
```

Raw exchange OHLCV candle: [timestamp, open, high, low, close, volume].
Elements allow undefined so any source fits without casts.
