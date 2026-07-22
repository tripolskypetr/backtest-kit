---
title: docs/type/OrderFillContract
group: docs
---

# OrderFillContract

```ts
type OrderFillContract = OrderFillOpenContract | OrderFillCloseContract;
```

Discriminated union for broker-confirmed order fill events.
Emitted via orderFillSubject strictly AFTER the "confirmed" verdict — see
OrderFillBase for the full semantics and the non-emission cases.
