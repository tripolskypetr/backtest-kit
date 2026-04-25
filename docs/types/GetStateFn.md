---
title: docs/type/GetStateFn
group: docs
---

# GetStateFn

```ts
type GetStateFn<Value extends object = object> = () => Promise<Value>;
```

Reads the current state value for the active pending or scheduled signal.
Resolved from execution context — no signalId argument required.
