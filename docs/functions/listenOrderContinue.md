---
title: docs/function/listenOrderContinue
group: docs
---

# listenOrderContinue

```ts
declare function listenOrderContinue(fn: (event: OrderContinueContract) => void): () => void;
```

Subscribes to post-verdict order-check CONTINUE events with queued async processing.

Paired with {@link listenOrderStop}: the pre-verdict {@link listenCheck} fires the
ping REQUEST before the broker adapter answers; this channel carries the resolved
NON-terminal decision — the order is confirmed still open (`event.attempt` 0) or a
transient check failure was tolerated (`event.attempt` &gt; 0) and monitoring
continues. Emitted on every live tick while the monitored signal survives the
check, for both states (`event.type` "active"/"schedule").

Live-only: backtest never runs order checks. NOTIFICATION channel, not a gate:
a throw from the listener is swallowed at the emission site (logged + errorEmitter)
and cannot affect the already-made monitoring decision.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle continue events. If the function returns a promise, processing is queued sequentially. |
