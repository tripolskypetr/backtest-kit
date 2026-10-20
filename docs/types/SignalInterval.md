---
title: docs/type/SignalInterval
group: docs
---

# SignalInterval

```ts
type SignalInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d";
```

Signal generation interval for throttling.
Enforces minimum time between getSignal calls.
