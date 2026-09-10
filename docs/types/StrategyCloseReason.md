---
title: docs/type/StrategyCloseReason
group: docs
---

# StrategyCloseReason

```ts
type StrategyCloseReason = "time_expired" | "take_profit" | "stop_loss" | "liquidation" | "closed";
```

Reason why signal was closed.
Used in discriminated union for type-safe handling.
