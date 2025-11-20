---
title: docs/api-reference/type/SignalInterval
group: docs
---

# SignalInterval

```ts
type SignalInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h";
```

Signal generation interval for throttling.
Enforces minimum time between getSignal calls.
