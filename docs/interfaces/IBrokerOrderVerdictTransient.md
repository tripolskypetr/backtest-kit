---
title: docs/interface/IBrokerOrderVerdictTransient
group: docs
---

# IBrokerOrderVerdictTransient

Framework-side resolution of an order gate (onOrderSync) or order check (onOrderCheck),
discriminated by `reason`.

Adapters/listeners do NOT construct this union — they signal via return/throw
(return normally or `true` = confirmed; throw a non-typed error = transient;
throw OrderRejectedError / OrderDeletedError = terminal). The framework collapses
those signals into this verdict and routes on it:

- "transient" — the operation FAILED with an unknown/temporary cause (network blip,
  lost response, exchange 5xx). Bounded retry: opens retry identity-stably up to
  CC_ORDER_OPEN_RETRY_ATTEMPTS, closes up to CC_ORDER_CLOSE_RETRY_ATTEMPTS, checks
  tolerate up to CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive failures.

## Properties

### reason

```ts
reason: "transient"
```

Unknown/temporary failure — bounded retry / tolerance window

### error

```ts
error: unknown
```

The failure that produced this verdict, when available
