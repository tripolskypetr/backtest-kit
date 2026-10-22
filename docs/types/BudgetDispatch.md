---
title: docs/type/BudgetDispatch
group: docs
---

# BudgetDispatch

```ts
type BudgetDispatch = (prev: IBudgetValue, full: IBudgetValue) => BudgetAction | null | Promise<BudgetAction | null>;
```

Updater of `setState` — receives the fold of the journal up to `when` (what
the caller is allowed to see) and returns the action to insert at `when`, or
null for a no-op. Runs inside the instance's `queued` section, so the check
and the write are atomic within the process, like `setState(prev =&gt; ...)`.
The second argument is the WHOLE journal, rows past `when` included: it is
for diagnostics only (a release aimed at a reserve that lies in the caller's
future), never for the decision itself.
