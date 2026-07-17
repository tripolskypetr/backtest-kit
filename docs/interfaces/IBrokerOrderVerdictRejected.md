---
title: docs/interface/IBrokerOrderVerdictRejected
group: docs
---

# IBrokerOrderVerdictRejected

Framework-side resolution of an order gate (onOrderSync) or order check (onOrderCheck),
discriminated by `reason`.

Adapters/listeners do NOT construct this union — they signal via return/throw
(return normally or `true` = confirmed; throw a non-typed error = transient;
throw OrderRejectedError / OrderDeletedError = terminal). The framework collapses
those signals into this verdict and routes on it:

- "rejected" — TERMINAL business rejection (OrderRejectedError: "no counterparty,
  retrying is pointless"). A rejected open is dropped without arming the retry; a
  rejected close is force-closed immediately.

## Properties

### reason

```ts
reason: "rejected"
```

Terminal business rejection (OrderRejectedError) — no retry

### error

```ts
error: unknown
```

The OrderRejectedError that produced this verdict
