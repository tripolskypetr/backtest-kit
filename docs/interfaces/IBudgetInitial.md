---
title: docs/interface/IBudgetInitial
group: docs
---

# IBudgetInitial

Initial value of a budget record, the counterpart of `initialValue` in `State`.
`initialCapital` is undefined for a static call that did not bring one: the
instance then refuses to create the record (BudgetMissingError) and only
serves a record that already exists (persisted, or created by an earlier call).

## Properties

### initialCapital

```ts
initialCapital: number
```
