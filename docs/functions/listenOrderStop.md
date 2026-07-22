---
title: docs/function/listenOrderStop
group: docs
---

# listenOrderStop

```ts
declare function listenOrderStop(fn: (event: OrderStopContract) => void): () => void;
```

Subscribes to post-verdict order-check STOP events with queued async processing.

Paired with {@link listenOrderContinue}: fires exactly once per monitored signal
when the check resolved TERMINALLY — `event.reason` "deleted" (OrderDeletedError:
confirmed order-not-found, bypassing the tolerance counter) or "exhausted"
(CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive transient failures spent, or the
legacy config 0). Emitted right BEFORE the teardown: close "closed" for
`event.type` "active", cancel "user" for "schedule". `event.attempt` carries the
final failure streak.

Live-only: backtest never runs order checks. NOTIFICATION channel, not a gate:
a throw from the listener is swallowed at the emission site (logged + errorEmitter)
and cannot affect the already-made terminal decision.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle stop events. If the function returns a promise, processing is queued sequentially. |
