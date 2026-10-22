---
title: docs/class/BudgetLiveAdapter
group: docs
---

# BudgetLiveAdapter

Implements `TBudgetAdapter`

Live trading budget adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable budget instance implementations
- Default backend: BudgetPersistInstance (file-system backed, survives restarts)
- Alternative backends: BudgetLocalInstance, BudgetDummyInstance
- Convenience methods: useLocal(), usePersist(), useDummy(), useBudgetAdapter()
- Memoized instances per (record key, name) pair; the record lives until clear()

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

Switches to in-memory adapter.
All data lives in process memory only.

### usePersist

```ts
usePersist: () => void
```

Switches to file-system backed adapter (default).
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
Call this when process.cwd() changes between strategy iterations
so new instances are created with the updated base path.
