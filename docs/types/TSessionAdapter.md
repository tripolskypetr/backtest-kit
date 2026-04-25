---
title: docs/type/TSessionAdapter
group: docs
---

# TSessionAdapter

```ts
type TSessionAdapter = {
    [key in Exclude<keyof ISessionInstance, "waitForInit" | "dispose">]: any;
};
```

Public surface of SessionBacktestAdapter / SessionLiveAdapter — ISessionInstance minus waitForInit and dispose.
waitForInit and dispose are managed internally by the adapter.
