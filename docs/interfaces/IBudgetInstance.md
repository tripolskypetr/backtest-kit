---
title: docs/interface/IBudgetInstance
group: docs
---

# IBudgetInstance

Interface for budget instance implementations.
Defines the contract for local, persist, and dummy backends — the same four
methods as `IStateInstance`, with the record value being an ordered journal
instead of a single `(_value, _when)` pair:

- `getState(when)` returns the fold of the journal up to `when` (I1: a read
  sees only the past, including rows written by symbols that are ahead only
  up to the reader's own time);
- `setState(dispatch, when)` inserts the action returned by `dispatch` at its
  `timestamp = when` and recomputes the balances after it (I2: a row from the
  past shifts later balances instead of overwriting them).

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize the budget instance.

### getState

```ts
getState: (when: Date) => Promise<IBudgetValue>
```

Read the fold of the journal up to `when` inclusive.

### setState

```ts
setState: (dispatch: BudgetDispatch, when: Date) => Promise<IBudgetHistoryRow>
```

Insert the action returned by `dispatch` at `when`.
The dispatch receives the fold up to `when`; the check it does and the
insertion are atomic within the process (`queued`).

### dispose

```ts
dispose: () => Promise<void>
```

Releases any resources held by this instance.
