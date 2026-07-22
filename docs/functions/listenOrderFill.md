---
title: docs/function/listenOrderFill
group: docs
---

# listenOrderFill

```ts
declare function listenOrderFill(fn: (event: OrderFillContract) => void): () => void;
```

Subscribes to broker-CONFIRMED order fill events with queued async processing.

Post-verdict mirror of {@link listenSync}: fires ONLY after the onOrderSync gate
resolved into the "confirmed" IBrokerOrderVerdict — the broker adapter acknowledged
the order really executed/placed on the exchange. A transient or terminal
(OrderRejectedError) gate rejection does NOT fire here, and neither does a
FORCE-close performed without broker confirmation.

Discriminated exactly like OrderSyncContract:
- action "signal-open", type "active" — the position order FILLED;
- action "signal-open", type "schedule" — the resting entry order was PLACED;
- action "signal-close" — the exit order executed.

Live-only: backtest gates short-circuit to "confirmed" without an exchange, so
nothing is emitted there.

Unlike listenSync this is a NOTIFICATION channel, not a gate: a throw from the
listener is swallowed at the emission site (logged + errorEmitter) and cannot
affect the already-resolved verdict. Safe for telegram/webhook/audit consumers.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle confirmed fill events. If the function returns a promise, processing is queued sequentially. |
