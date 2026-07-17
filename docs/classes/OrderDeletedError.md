---
title: docs/class/OrderDeletedError
group: docs
---

# OrderDeletedError

Extends `Error`

CONFIRMED order-not-found — "the exchange definitively reports there is no order
under this id anymore" (e.g. the user cancelled it manually on the exchange, or it
was liquidated / garbage-collected externally).

## Where to throw it

Only from the ORDER CHECKS (the `onOrderCheck` ping channel), i.e. any of:
- `Broker.useBrokerAdapter` → `onOrderActiveCheck` / `onOrderScheduleCheck`;
- action schema `callbacks.onOrderCheck` / handler `IAction.orderCheck` (deprecated channel);
- a `listenCheck` listener.

## What the framework does

The throw propagates UNWRAPPED through every layer (the runtime brand survives)
and resolves into the `IBrokerOrderVerdict` `{ reason: "deleted" }` — terminal
IMMEDIATELY, bypassing the CC_ORDER_CHECK_RETRY_ATTEMPTS tolerance counter:

- `event.type === "active"` (open position): the position is closed with
  closeReason "closed" WITHOUT re-confirmation through the close gate — the ping
  already established the order is gone, re-asking the broker would be redundant.
- `event.type === "schedule"` (resting entry order): the scheduled signal is
  cancelled with reason "user". The schedule-cancelled lifecycle event still
  reaches the broker adapter (`onSignalScheduleCancelled`); cancelling an
  already-gone order there is a no-op.

Loudness: `errorEmitter` fires. `exitEmitter` does NOT fire — a confirmed
not-found is a business fact about ONE order, not a fatal network condition.
Compare with transient-failure exhaustion of the same check, which DOES signal
a fatal exit.

## When it is appropriate

Throw ONLY on the exchange's definitive "order not found by `event.signalId`"
response. Two critical distinctions:

- **A FILLED resting order is NOT a deleted order.** If the scheduled entry
  actually filled, confirm it via `commitActivateScheduled` instead — a throw here
  is a terminal CANCEL, not an activation. Same for an open position whose TP/SL
  order filled on the exchange: report it via `commitCreateTakeProfit` /
  `commitCreateStopLoss` so the close carries the true closeReason, instead of
  collapsing it into a generic "closed".
- **Network trouble is NOT a deleted order.** On timeout / 5xx / rate limit /
  disconnect throw a plain Error or {@link OrderTransientError}: the framework
  tolerates up to CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive transient failures
  (the order is assumed still open, `event.attempt` increments) before acting
  terminally. Reporting a blip as "deleted" kills a live position on the spot.

## Nuances

- **Context-specific.** This error belongs to the CHECKS. Throwing it from a GATE
  (`onOrderOpenCommit` / `onOrderCloseCommit` / `callbacks.onOrderSync`) is a
  userspace protocol violation: it is INTENTIONALLY degraded to the "transient"
  verdict (bounded retry) instead of being honored as terminal.
- **Nominal runtime identification.** Recognized by the
  `__type__ === Symbol.for("OrderDeletedError")` brand via the static guard —
  never by `instanceof`, so it survives duplicated module instances across bundles.
- **Live-only.** Checks never fire in backtest (there is no live exchange to query).
- A successful check resets the consecutive-failure counter (`event.attempt`) to 0;
  this error ignores the counter entirely in both directions — it neither needs
  prior failures nor is delayed by remaining tolerance.
- The `message` is optional and purely informational; routing depends only on the
  brand.

## Constructor

```ts
constructor(message: string);
```

## Properties

### __type__

```ts
__type__: symbol
```

Runtime brand (Symbol.for — survives duplicated module instances)

## Methods

### isOrderDeletedError

```ts
static isOrderDeletedError(error: object): boolean;
```

Nominal type guard by the runtime brand. Use this instead of `instanceof`:
the check is based on `Symbol.for`, so it recognizes instances created by a
DIFFERENT copy of this module (duplicated bundles, linked packages).

### fromError

```ts
static fromError(error: object): OrderDeletedError;
```

Nominal constructor for a new OrderDeletedError from any thrown object. Use this
instead of `instanceof` to recognize instances created by a DIFFERENT copy of
this module (duplicated bundles, linked packages).
