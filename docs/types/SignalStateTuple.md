---
title: docs/type/SignalStateTuple
group: docs
---

# SignalStateTuple

```ts
type SignalStateTuple<Value extends object = object> = [
    GetStateFn<Value>,
    SetStateFn<Value>
];
```

Tuple returned by createSignalState — [getState, setState] bound to the bucket.
Both functions resolve the active signal and backtest flag from execution context automatically.
