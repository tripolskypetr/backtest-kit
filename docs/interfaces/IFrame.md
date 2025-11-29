---
title: docs/api-reference/interface/IFrame
group: docs
---

# IFrame

Frame interface for timeframe generation.
Used internally by backtest orchestration.

## Properties

### getTimeframe

```ts
getTimeframe: (symbol: string, frameName: string) => Promise<Date[]>
```

Generates array of timestamps for backtest iteration.
Timestamps are spaced according to the configured interval.
