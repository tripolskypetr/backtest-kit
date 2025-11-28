---
title: docs/api-reference/interface/IScheduledSignalRow
group: docs
---

# IScheduledSignalRow

Scheduled signal row for delayed entry at specific price.
Inherits from ISignalRow - represents a signal waiting for price to reach priceOpen.
Once price reaches priceOpen, will be converted to regular _pendingSignal.
Note: pendingAt will be set to scheduledAt until activation, then updated to actual pending time.

## Properties

### priceOpen

```ts
priceOpen: number
```

Entry price for the position
