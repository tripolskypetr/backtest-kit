---
title: docs/class/RecentBacktestAdapter
group: docs
---

# RecentBacktestAdapter

Implements `IRecentUtils`

Backtest recent signal adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable storage implementations
- Default adapter: RecentMemoryBacktestUtils (in-memory storage)
- Alternative adapter: RecentPersistBacktestUtils
- Convenience methods: usePersist(), useMemory()

## Constructor

```ts
constructor();
```

## Properties

### _recentBacktestUtils

```ts
_recentBacktestUtils: any
```

Internal storage utils instance

### handleActivePing

```ts
handleActivePing: (event: ActivePingContract) => Promise<void>
```

Handles active ping event.
Proxies call to the underlying storage adapter.

### getLatestSignal

```ts
getLatestSignal: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<IPublicSignalRow>
```

Retrieves the latest signal for the given context.
Proxies call to the underlying storage adapter.

### getMinutesSinceLatestSignalCreated

```ts
getMinutesSinceLatestSignalCreated: (timestamp: number, symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<number>
```

Returns the number of whole minutes elapsed since the latest signal's creation timestamp.
Proxies call to the underlying storage adapter.

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

Switches to persistent storage adapter.
Signals will be persisted to disk.

### useMemory

```ts
useMemory: () => void
```

Switches to in-memory storage adapter (default).
Signals will be stored in memory only.

### clear

```ts
clear: () => void
```

Clears the cached utils instance by resetting to the default in-memory adapter.
