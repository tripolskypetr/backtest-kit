---
title: docs/api-reference/interface/IRiskCallbacks
group: docs
---

# IRiskCallbacks

Optional callbacks for risk events.

## Properties

### onRejected

```ts
onRejected: (symbol: string, params: IRiskCheckArgs) => void
```

Called when a signal is rejected due to risk limits

### onAllowed

```ts
onAllowed: (symbol: string, params: IRiskCheckArgs) => void
```

Called when a signal passes risk checks
