---
title: docs/interface/IBudgetValue
group: docs
---

# IBudgetValue

Value of a budget record: the initial capital and the ordered journal.
`getState(when)` returns the fold of it up to `when` (rows with
`timestamp &lt;= when`), never the rows written by a symbol that is ahead.

## Properties

### initialCapital

```ts
initialCapital: number
```

### journal

```ts
journal: IBudgetHistoryRow[]
```
