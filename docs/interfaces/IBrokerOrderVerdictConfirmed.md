---
title: docs/interface/IBrokerOrderVerdictConfirmed
group: docs
---

# IBrokerOrderVerdictConfirmed

Framework-side resolution of an order gate (onOrderSync) or order check (onOrderCheck),
discriminated by `reason`.

Adapters/listeners do NOT construct this union — they signal via return/throw
(return normally or `true` = confirmed; throw a non-typed error = transient;
throw OrderRejectedError / OrderDeletedError = terminal). The framework collapses
those signals into this verdict and routes on it:

- "confirmed" — the gate allowed the open/close, or the checked order is still open.

## Properties

### reason

```ts
reason: "confirmed"
```

Gate confirmed / checked order is still alive
