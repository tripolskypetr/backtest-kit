---
title: docs/class/StorageLiveAdapter
group: docs
---

# StorageLiveAdapter

Implements `IStorageUtils`

Live trading storage adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable storage implementations
- Default adapter: StoragePersistLiveUtils (persistent storage)
- Alternative adapters: StorageMemoryLiveUtils, StorageDummyLiveUtils
- Convenience methods: usePersist(), useMemory(), useDummy()

## Constructor

```ts
constructor();
```

## Properties

### _signalLiveUtils

```ts
_signalLiveUtils: any
```

Internal storage utils instance

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
