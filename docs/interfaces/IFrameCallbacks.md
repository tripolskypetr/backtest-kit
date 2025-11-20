---
title: docs/api-reference/interface/IFrameCallbacks
group: docs
---

# IFrameCallbacks

Callbacks for frame lifecycle events.

## Properties

### onTimeframe

```ts
onTimeframe: (timeframe: Date[], startDate: Date, endDate: Date, interval: FrameInterval) => void
```

Called after timeframe array generation.
Useful for logging or validating the generated timeframes.
