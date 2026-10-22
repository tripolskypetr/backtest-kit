---
title: docs/interface/IGetCandlesFilledConfig
group: docs
---

# IGetCandlesFilledConfig

## Properties

### maxAnomalyStreak

```ts
maxAnomalyStreak: number
```

How many CONSECUTIVE anomalous source candles are repaired with a flat
fill before the function throws. Default:
GLOBAL_CONFIG.CC_GET_CANDLES_MAX_ANOMALY_STREAK.

### maxGapStreak

```ts
maxGapStreak: number
```

How many CONSECUTIVE grid positions without a sane source candle (missing
or anomalous rows) are filled flat before the function throws — tells a
technical pause from a delisting. Counted across request boundaries.
Infinity disables the limit. Default: GLOBAL_CONFIG.CC_GET_CANDLES_MAX_GAP_STREAK.
