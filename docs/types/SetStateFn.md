---
title: docs/type/SetStateFn
group: docs
---

# SetStateFn

```ts
type SetStateFn<Value extends object = object> = (symbol: string, dispatch: Value | Dispatch<Value>) => Promise<Value>;
```

Updates the state value for the active pending or scheduled signal.
Resolved from execution context — no signalId argument required.
