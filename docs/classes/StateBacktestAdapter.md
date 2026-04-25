---
title: docs/class/StateBacktestAdapter
group: docs
---

# StateBacktestAdapter

Implements `TStateAdapter`

Backtest state adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable state instance implementations
- Default backend: StateLocalInstance (in-memory, no disk persistence)
- Alternative backends: StatePersistInstance, StateDummyInstance
- Convenience methods: useLocal(), usePersist(), useDummy(), useStateAdapter()
- Memoized instances per (signalId, bucketName) pair; cleared via disposeSignal() from StateAdapter

Primary use case — LLM-driven capitulation rule:
Profitable trades endure -0.5–2.5% drawdown and still reach peak 2–3%+.
SL trades never go positive (Feb25) or show peak &lt; 0.15% (Feb08, Feb13).
Rule: if position open &gt;= N minutes and peakPercent &lt; threshold (e.g. 0.3%),
the LLM thesis was not confirmed by market — exit immediately.
State tracks `{ peakPercent, minutesOpen }` per signal across onActivePing ticks.

## Constructor

```ts
constructor();
```

## Properties

### StateFactory

```ts
StateFactory: any
```

### getInstance

```ts
getInstance: any
```

### disposeSignal

```ts
disposeSignal: (signalId: string) => void
```

Disposes all memoized instances for the given signalId.
Called by StateAdapter when a signal is cancelled or closed.

### getState

```ts
getState: <Value extends object = object>(dto: { signalId: string; bucketName: string; initialValue: object; }) => Promise<Value>
```

Read the current state value for a signal.

### setState

```ts
setState: <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string; bucketName: string; initialValue: object; }) => Promise<Value>
```

Update the state value for a signal.

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
Data is persisted to disk via PersistStateAdapter.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy adapter that discards all writes.

### useStateAdapter

```ts
useStateAdapter: (Ctor: TStateInstanceCtor) => void
```

Switches to a custom state adapter implementation.

### clear

```ts
clear: () => void
```

Clears the memoized instance cache.
Call this when process.cwd() changes between strategy iterations
so new instances are created with the updated base path.
