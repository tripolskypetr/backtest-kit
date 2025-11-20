---
title: docs/api-reference/type/StrategyCloseReason
group: docs
---

# StrategyCloseReason

```ts
type StrategyCloseReason = "time_expired" | "take_profit" | "stop_loss";
```

Reason why signal was closed.
Used in discriminated union for type-safe handling.
