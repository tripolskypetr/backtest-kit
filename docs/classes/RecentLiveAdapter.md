---
title: docs/class/RecentLiveAdapter
group: docs
---

# RecentLiveAdapter

Implements `IRecentUtils`

Live recent signal adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable storage implementations
- Default adapter: RecentPersistLiveUtils (persistent storage)
- Alternative adapter: RecentMemoryLiveUtils
- Convenience methods: usePersist(), useMemory()

## Constructor

```ts
constructor();
```

## Properties

### _recentLiveFactory

```ts
_recentLiveFactory: any
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

### handleActivePing

```ts
handleActivePing: (event: ActivePingContract) => Promise<void>
```

Handles active ping event.
Proxies call to the underlying storage adapter.

### getLatestSignal

```ts
getLatestSignal: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, when: Date) => Promise<IPublicSignalRow>
```

Retrieves the latest signal for the given context.
Proxies call to the underlying storage adapter.

### getMinutesSinceLatestSignalCreated

```ts
getMinutesSinceLatestSignalCreated: (timestamp: number, symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<number>
```

Returns the number of whole minutes elapsed since the latest signal's creation timestamp.
Proxies call to the underlying storage adapter. `timestamp` doubles as the
look-ahead cutoff — a signal whose `timestamp` exceeds the requested one is
treated as not yet visible.

### useRecentAdapter

```ts
useRecentAdapter: (Ctor: TRecentUtilsCtor) => void
```

Sets the storage adapter constructor.
All future storage operations will use this adapter.

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
