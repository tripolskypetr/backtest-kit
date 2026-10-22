---
title: docs/class/BudgetBacktestAdapter
group: docs
---

# BudgetBacktestAdapter

Implements `TBudgetAdapter`

Backtest budget adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable budget instance implementations
- Default backend: BudgetLocalInstance (in-memory, no disk persistence)
- Alternative backends: BudgetPersistInstance, BudgetDummyInstance
- Convenience methods: useLocal(), usePersist(), useDummy(), useBudgetAdapter()
- Memoized instances per (record key, name) pair; the record lives until clear()
  (no per-signal disposal: it is not bound to a signal)

## Constructor

```ts
constructor();
```

## Properties

### BudgetFactory

```ts
BudgetFactory: any
```

### getInstance

```ts
getInstance: any
```

### getState

```ts
getState: (dto: TBudgetAdapterDto) => Promise<IBudgetValue>
```

Read the fold of the journal up to `dto.when`.

### setState

```ts
setState: (dispatch: BudgetDispatch, dto: TBudgetAdapterDto) => Promise<IBudgetHistoryRow>
```

Insert the action returned by `dispatch` at `dto.when`.

### useLocal

```ts
useLocal: () => void
```

Switches to in-memory adapter (default).
All data lives in process memory only.

### usePersist

```ts
usePersist: () => void
```

Switches to file-system backed adapter.
Data is persisted to disk via PersistBudgetAdapter.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy adapter that discards all writes.

### useBudgetAdapter

```ts
useBudgetAdapter: (Ctor: TBudgetInstanceCtor) => void
```

Switches to a custom budget adapter implementation.

### clear

```ts
clear: () => void
```

Clears the memoized instance cache.
Call this before a new run (or when process.cwd() changes between strategy
iterations) so new instances start from a fresh journal / the updated base path.
