---
title: docs/interface/ISignalIntervalDto
group: docs
---

# ISignalIntervalDto

Signal dto for IntervalUtils.fn which allows returning multiple signals in one getSignal call.
This will pause the next signal untill interval elapses

## Properties

### id

```ts
id: string
```

Unique signal identifier (UUID v4 auto-generated)
