---
title: docs/type/OrderRejectContract
group: docs
---

# OrderRejectContract

```ts
type OrderRejectContract = OrderRejectOpenContract | OrderRejectCloseContract;
```

Discriminated union for terminal order rejection events.
Emitted via orderRejectSubject strictly on the "rejected" verdict — see
OrderRejectBase for the full semantics and the non-emission cases.
