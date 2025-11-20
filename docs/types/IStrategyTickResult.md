---
title: docs/api-reference/type/IStrategyTickResult
group: docs
---

# IStrategyTickResult

```ts
type IStrategyTickResult = IStrategyTickResultIdle | IStrategyTickResultOpened | IStrategyTickResultActive | IStrategyTickResultClosed;
```

Discriminated union of all tick results.
Use type guards: `result.action === "closed"` for type safety.
