---
title: docs/type/IStrategyTickResult
group: docs
---

# IStrategyTickResult

```ts
type IStrategyTickResult = IStrategyTickResultIdle | IStrategyTickResultScheduled | IStrategyTickResultWaiting | IStrategyTickResultOpened | IStrategyTickResultActive | IStrategyTickResultClosed | IStrategyTickResultCancelled;
```

Discriminated union of all tick results.
Use type guards: `result.action === "closed"` for type safety.
