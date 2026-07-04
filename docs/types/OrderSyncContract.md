---
title: docs/type/OrderSyncContract
group: docs
---

# OrderSyncContract

```ts
type OrderSyncContract = OrderOpenContract | OrderCloseContract;
```

Discriminated union for order sync events.

Emitted to allow external systems to synchronize with the framework's
order lifecycle: open (type "active" — immediate/activation fill; type
"schedule" — placement of the resting entry order at scheduled-signal
creation) and close (position exited, always type "active").

Note: cancelled scheduled signals do NOT emit OrderOpenContract — their
teardown goes through the schedule-event channel (Broker.commitScheduleCancelled).
