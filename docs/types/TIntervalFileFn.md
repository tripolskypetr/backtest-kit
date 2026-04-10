---
title: docs/type/TIntervalFileFn
group: docs
---

# TIntervalFileFn

```ts
type TIntervalFileFn = (symbol: string, ...args: any[]) => Promise<ISignalIntervalDto | null>;
```

Signal function type for persistent file-based once-per-interval firing.
First argument is always `symbol: string`, followed by optional spread args.
Fired state survives process restarts via `PersistIntervalAdapter`.
