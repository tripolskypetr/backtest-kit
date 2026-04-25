---
title: docs/type/TStateAdapter
group: docs
---

# TStateAdapter

```ts
type TStateAdapter = {
    [key in Exclude<keyof IStateInstance, "waitForInit" | "dispose">]: any;
};
```

Public surface of StateBacktestAdapter / StateLiveAdapter — IStateInstance minus waitForInit and dispose.
waitForInit and dispose are managed internally by the adapter.
