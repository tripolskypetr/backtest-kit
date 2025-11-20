---
title: docs/api-reference/type/FrameInterval
group: docs
---

# FrameInterval

```ts
type FrameInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d";
```

Timeframe interval for backtest period generation.
Determines the granularity of timestamps in the generated timeframe array.

Minutes: 1m, 3m, 5m, 15m, 30m
Hours: 1h, 2h, 4h, 6h, 8h, 12h
Days: 1d, 3d
