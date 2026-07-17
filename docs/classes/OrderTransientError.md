---
title: docs/class/OrderTransientError
group: docs
---

# OrderTransientError

Extends `Error`

EXPLICIT transient failure marker — "the operation failed for a temporary /
unknown reason (network blip, lost response, exchange 5xx, rate limit); retry me".

## Purpose: declarative sugar, not routing

The framework treats EVERY non-typed throw from the order gates and checks as the
"transient" verdict already — this class adds NO special handling and is NOT
pattern-matched anywhere in the framework by design. A plain `throw new Error(...)`
behaves identically. The class exists purely so application code states its intent
explicitly: a reader of the adapter sees "transient" spelled out instead of having
to know that unbranded throws default to it. Use it as the third leg of the triad:

- {@link OrderRejectedError} — terminal business rejection (GATES);
- {@link OrderDeletedError} — confirmed order-not-found (CHECKS);
- OrderTransientError — everything temporary, in EITHER context.

## What the "transient" verdict means per channel

Resolved as `IBrokerOrderVerdict` `{ reason: "transient" }`
(see interfaces/Broker.interface):

- **Open gate** (`onOrderOpenCommit` type "active"/"schedule",
  `callbacks.onOrderSync`, `listenSync`): the open is retried IDENTITY-STABLY —
  the same signal row with the SAME signalId is re-submitted on the next tick
  (`event.attempt` increments; the armed retry survives a crash via persistence),
  up to CC_ORDER_OPEN_RETRY_ATTEMPTS. Tag exchange orders with
  `clientOrderId = signalId` and a retry after a LOST RESPONSE resolves to
  "duplicate order" on the exchange and reconciles instead of double-buying.
  Exhaustion drops the signal loudly AND signals `exitEmitter` (fatal: the network
  would not let the engine work). With the config at 0 the retry slot is disabled:
  a rejected open is dropped at once and the next tick regenerates a FRESH id.
- **Close gate** (`onOrderCloseCommit`, same listeners): the position stays open
  and the close is re-attempted on the next tick/candle (`event.attempt`
  increments), up to CC_ORDER_CLOSE_RETRY_ATTEMPTS. Exhaustion FORCE-CLOSES the
  engine state with the ORIGINAL closeReason + `errorEmitter` + `exitEmitter`
  (the real exchange position must be reconciled by the adapter/operator).
  With the config at 0 the cap is disabled: the close retries forever (legacy).
- **Checks** (`onOrderActiveCheck` / `onOrderScheduleCheck`,
  `callbacks.onOrderCheck`, `listenCheck`): the failed ping is TOLERATED — the
  order is assumed still open and monitoring continues (`event.attempt`
  increments), up to CC_ORDER_CHECK_RETRY_ATTEMPTS CONSECUTIVE failures; a single
  successful check resets the streak to 0. Exhaustion acts terminally (close
  "closed" / cancel "user") + `exitEmitter`. With the config at 0 any failure is
  terminal on the spot (legacy).

## Nuances

- **Counted per consecutive failures, not per elapsed ticks.** For checks the ping
  fires every live tick, so "consecutive" is literal; for the close gate the
  counter advances only when a close actually triggers and gets rejected — gaps
  where no close condition holds do not touch it (only a confirmed gate or a
  position transition resets it).
- **Exhaustion of transient failures is FATAL** (`exitEmitter` after the
  `errorEmitter` log) — unlike the typed terminal errors above, which are business
  outcomes and never signal a process exit.
- **In-memory close/check counters.** They reset on restart (safe direction: the
  broker gets fresh attempts before the dangerous force action); only the OPEN
  retry identity/count is persisted, because losing it would break clientOrderId
  idempotency.
- **Nominal brand for symmetry.** `__type__ === Symbol.for("OrderTransientError")`
  and the static guard exist for consistency with the other two errors (useful in
  the application's own logging/metrics); the framework itself never checks it.
- **Live-only in production wiring.** Backtest short-circuits gates and never
  fires checks.

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

### isOrderTransientError

```ts
static isOrderTransientError(error: object): boolean;
```

Nominal type guard by the runtime brand. Provided for symmetry with
OrderRejectedError / OrderDeletedError (e.g. for application-side logging) —
the framework itself does not branch on it: transient is the default verdict
for ANY non-typed throw.

### fromError

```ts
static fromError(error: object): OrderTransientError;
```

Nominal constructor for a new OrderTransientError from any thrown object. Use this
instead of `instanceof` to recognize instances created by a DIFFERENT copy of
this module (duplicated bundles, linked packages).
