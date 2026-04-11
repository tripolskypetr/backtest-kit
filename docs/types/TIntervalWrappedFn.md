---
title: docs/type/TIntervalWrappedFn
group: docs
---

# TIntervalWrappedFn

```ts
type TIntervalWrappedFn<T extends object = object> = (symbol: string) => Promise<T | null>;
```

Wrapped function returned by `Interval.fn` and `Interval.file`.
`when` is resolved internally from the execution context — callers pass only `symbol`.
