---
title: docs/interface/ISizingCallbacks
group: docs
---

# ISizingCallbacks

Callbacks for sizing lifecycle events.

## Properties

### onCalculate

```ts
onCalculate: (quantity: number, params: ISizingCalculateParams) => void | Promise<void>
```

Called after position size calculation.
Useful for logging or validating the calculated size.
