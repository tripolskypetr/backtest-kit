---
title: docs/type/Dispatch
group: docs
---

# Dispatch

```ts
type Dispatch<Value extends object = object> = (value: Value) => Value | Promise<Value>;
```

Updater function for setState — receives current value and returns the next value.
Used for functional updates to state, e.g. `setState(prev =&gt; ({ ...prev, peakPercent: newPeak }))`
