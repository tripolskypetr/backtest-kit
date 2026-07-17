---
title: docs/class/OrderRejectedError
group: docs
---

# OrderRejectedError

Extends `Error`

TERMINAL business rejection of an order operation — "the exchange definitively
refused this order and retrying is pointless".

## Where to throw it

Only from the ORDER GATES (the `onOrderSync` channel), i.e. any of:
- `Broker.useBrokerAdapter` → `onOrderOpenCommit` / `onOrderCloseCommit`;
- action schema `callbacks.onOrderSync` / handler `IAction.orderSync` (deprecated channel);
- a `listenSync` listener.

## What the framework does

The throw propagates UNWRAPPED through every layer (none of them re-wrap errors —
the runtime brand survives) and resolves into the `IBrokerOrderVerdict`
`{ reason: "rejected" }` (see interfaces/Broker.interface). Consequences:

- **signal-open** (type "active" or "schedule"): the open is DROPPED immediately.
  The identity-stable retry (CC_ORDER_OPEN_RETRY_ATTEMPTS) is NOT armed, and an
  already-armed retry slot for this signalId is wiped from memory and persistence —
  the trade attempt will not resurrect on the next tick or after a restart. The
  interval throttle is rolled back, so the strategy may generate a FRESH signal
  (new id) on the very next tick.
- **signal-close**: the engine FORCE-CLOSES its own position state immediately with
  the ORIGINAL closeReason (take_profit / stop_loss / time_expired / closed),
  bypassing the CC_ORDER_CLOSE_RETRY_ATTEMPTS retry loop. The standard signal-close
  lifecycle event still fires and reaches the broker adapter
  (`onSignalPendingClose`) — the REAL exchange position may still exist, and its
  reconciliation is the adapter's/operator's responsibility.

Loudness: `errorEmitter` fires (warn + console on every layer). `exitEmitter` does
NOT fire — a business rejection is a normal (if unhappy) outcome, not a fatal
network condition; the process keeps running. Compare with transient exhaustion,
which DOES signal a fatal exit.

## When it is appropriate

Throw only on a CONFIRMED business impossibility reported by the exchange:
no counterparty / no liquidity, symbol delisted or trading halted, min-notional /
lot-size violation, account restriction — anything where repeating the same
request can never succeed. Do NOT throw it on network trouble (timeout, 5xx,
rate limit, lost response): throw a plain Error or {@link OrderTransientError}
instead so the bounded retry machinery gets its chance.

## Nuances

- **Context-specific.** This error belongs to the GATES. Throwing it from the CHECK
  channel (`onOrderActiveCheck` / `onOrderScheduleCheck` / `callbacks.onOrderCheck`
  / `listenCheck`) is a userspace protocol violation: it is INTENTIONALLY degraded
  to the "transient" verdict (counted toward CC_ORDER_CHECK_RETRY_ATTEMPTS) instead
  of being honored as terminal.
- **Nominal runtime identification.** The framework recognizes the error by the
  `__type__ === Symbol.for("OrderRejectedError")` brand via the static guard —
  never by `instanceof`, so it survives duplicated module instances across bundles.
  Any subclass or foreign copy carrying the same global symbol is recognized too.
- **Live-only in production wiring.** In backtest the gates short-circuit to
  "confirmed" before any listener runs, so the error can only matter in live mode
  (or in tests that mock `params.onOrderSync` directly — the client-side guard
  handles that path identically).
- The `message` is optional and purely informational (it ends up in warn logs and
  the errorEmitter payload); routing depends only on the brand.

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

### isOrderRejectedError

```ts
static isOrderRejectedError(error: object): boolean;
```

Nominal type guard by the runtime brand. Use this instead of `instanceof`:
the check is based on `Symbol.for`, so it recognizes instances created by a
DIFFERENT copy of this module (duplicated bundles, linked packages).

### fromError

```ts
static fromError(error: object): OrderRejectedError;
```

Nominal constructor for a new OrderRejectedError from any thrown object. Use this
instead of `instanceof` to recognize instances created by a DIFFERENT copy of
this module (duplicated bundles, linked packages).
