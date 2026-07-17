---
title: docs/interface/IBrokerOrderVerdictDeleted
group: docs
---

# IBrokerOrderVerdictDeleted

Framework-side resolution of an order gate (onOrderSync) or order check (onOrderCheck),
discriminated by `reason`.

Adapters/listeners do NOT construct this union — they signal via return/throw
(return normally or `true` = confirmed; throw a non-typed error = transient;
throw OrderRejectedError / OrderDeletedError = terminal). The framework collapses
those signals into this verdict and routes on it:

- "deleted" — CONFIRMED order-not-found (OrderDeletedError: e.g. the user cancelled
  the order manually on the exchange). Checks act terminally at once (close "closed"
  / cancel "user"), bypassing the tolerance counter.

## Properties

### reason

```ts
reason: "deleted"
```

Confirmed order-not-found (OrderDeletedError) — checks act terminally

### error

```ts
error: unknown
```

The OrderDeletedError that produced this verdict
