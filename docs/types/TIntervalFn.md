---
title: docs/type/TIntervalFn
group: docs
---

# TIntervalFn

```ts
type TIntervalFn<T extends object = object> = (symbol: string, when: Date) => Promise<T | null>;
```

User-implemented function fired once per interval boundary.
Receives `when` from the caller (sourced from execution context).
