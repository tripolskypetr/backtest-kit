---
title: docs/type/TMemoryInstance
group: docs
---

# TMemoryInstance

```ts
type TMemoryInstance = Omit<{
    [key in keyof IMemoryInstance]: any;
}, keyof {
    waitForInit: never;
    dispose: never;
}>;
```

Public surface of MemoryBacktestAdapter / MemoryLiveAdapter — IMemoryInstance minus waitForInit.
waitForInit is managed internally by the adapter.
