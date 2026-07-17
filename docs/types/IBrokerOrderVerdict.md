---
title: docs/type/IBrokerOrderVerdict
group: docs
---

# IBrokerOrderVerdict

```ts
type IBrokerOrderVerdict = IBrokerOrderVerdictConfirmed | IBrokerOrderVerdictTransient | IBrokerOrderVerdictRejected | IBrokerOrderVerdictDeleted;
```

Framework-side resolution of an order gate (onOrderSync) or order check (onOrderCheck),
discriminated by `reason`.

Adapters/listeners do NOT construct this union — they signal via return/throw
(return normally or `true` = confirmed; throw a non-typed error = transient;
throw OrderRejectedError / OrderDeletedError = terminal). The framework collapses
those signals into this verdict and routes on it:

- "confirmed" — the gate allowed the open/close, or the checked order is still open.
- "transient" — the operation FAILED with an unknown/temporary cause (network blip,
  lost response, exchange 5xx). Bounded retry: opens retry identity-stably up to
  CC_ORDER_OPEN_RETRY_ATTEMPTS, closes up to CC_ORDER_CLOSE_RETRY_ATTEMPTS, checks
  tolerate up to CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive failures.
- "rejected" — TERMINAL business rejection (OrderRejectedError: "no counterparty,
  retrying is pointless"). A rejected open is dropped without arming the retry; a
  rejected close is force-closed immediately.
- "deleted" — CONFIRMED order-not-found (OrderDeletedError: e.g. the user cancelled
  the order manually on the exchange). Checks act terminally at once (close "closed"
  / cancel "user"), bypassing the tolerance counter.

Every consumer MUST branch on `reason` explicitly — the union is an object and is
always truthy, so boolean-style `if (!verdict)` checks are meaningless by design.

The typed errors are CONTEXT-SPECIFIC: OrderRejectedError belongs to the gates
(onOrderOpenCommit/onOrderCloseCommit), OrderDeletedError to the checks
(onOrderActiveCheck/onOrderScheduleCheck). Throwing one in the other's context is a
userspace protocol violation and INTENTIONALLY degrades to "transient" (bounded
retry + loud errorEmitter) instead of being honored as terminal.
