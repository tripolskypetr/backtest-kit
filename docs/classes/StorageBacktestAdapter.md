---
title: docs/class/StorageBacktestAdapter
group: docs
---

# StorageBacktestAdapter

Implements `IStorageUtils`

Backtest storage adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable storage implementations
- Default adapter: StorageMemoryBacktestUtils (in-memory storage)
- Alternative adapters: StoragePersistBacktestUtils, StorageDummyBacktestUtils
- Convenience methods: usePersist(), useMemory(), useDummy()

## Constructor

```ts
constructor();
```

## Properties

### _signalBacktestFactory

```ts
_signalBacktestFactory: any
```

Factory producing the active storage utils instance

### getInstance

```ts
getInstance: any
```

Lazily constructs the storage utils from the registered factory and memoizes
the result via `singleshot`.

The instance is built on the first call and cached for all subsequent calls.
Reset via `clear()` so the next call rebuilds from the current factory.

### handleOpened

```ts
handleOpened: (tick: IStrategyTickResultOpened) => Promise<void>
```

Handles signal opened event.
Proxies call to the underlying storage adapter.

### handleClosed

```ts
handleClosed: (tick: IStrategyTickResultClosed) => Promise<void>
```

Handles signal closed event.
Proxies call to the underlying storage adapter.

### handleScheduled

```ts
handleScheduled: (tick: IStrategyTickResultScheduled) => Promise<void>
```

Handles signal scheduled event.
Proxies call to the underlying storage adapter.

### handleCancelled

```ts
handleCancelled: (tick: IStrategyTickResultCancelled) => Promise<void>
```

Handles signal cancelled event.
Proxies call to the underlying storage adapter.

### findById

```ts
findById: (id: string) => Promise<IStorageSignalRow>
```

Finds a signal by its ID.
Proxies call to the underlying storage adapter.

### list

```ts
list: () => Promise<IStorageSignalRow[]>
```

Lists all stored signals.
Proxies call to the underlying storage adapter.

### handleActivePing

```ts
handleActivePing: (event: ActivePingContract) => Promise<void>
```

Handles active ping event for opened signals.
Updates updatedAt for the signal if it is currently opened.

### handleSchedulePing

```ts
handleSchedulePing: (event: SchedulePingContract) => Promise<void>
```

Handles schedule ping event for scheduled signals.
Updates updatedAt for the signal if it is currently scheduled.

### useStorageAdapter

```ts
useStorageAdapter: (Ctor: TStorageUtilsCtor) => void
```

Sets the storage adapter constructor.
All future storage operations will use this adapter.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy storage adapter.
All future storage writes will be no-ops.

### usePersist

```ts
usePersist: () => void
```

Switches to persistent storage adapter (default).
Signals will be persisted to disk.

### useMemory

```ts
useMemory: () => void
```

Switches to in-memory storage adapter.
Signals will be stored in memory only.

### clear

```ts
clear: () => void
```

Clears the memoized utils instance.
Call this when process.cwd() changes between strategy iterations
so a new instance is created with the updated base path.
