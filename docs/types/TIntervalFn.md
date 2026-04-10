---
title: docs/type/TIntervalFn
group: docs
---

# TIntervalFn

```ts
type TIntervalFn = (symbol: string, when: Date) => Promise<ISignalIntervalDto | null>;
```

Signal function type for in-memory once-per-interval firing.
Called at most once per interval boundary per symbol.
Must return a non-null `ISignalIntervalDto` to start the interval countdown,
or `null` to defer firing until the next call.
