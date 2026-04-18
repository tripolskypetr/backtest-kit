---
title: docs/class/PersistRecentUtils
group: docs
---

# PersistRecentUtils

Utility class for managing recent signal persistence.

Features:
- Memoized storage instances per (symbol, strategyName, exchangeName, frameName) context
- Custom adapter support
- Atomic read/write operations
- Crash-safe recent signal state management

Used by RecentPersistBacktestUtils/RecentPersistLiveUtils for recent signal persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistRecentFactory

```ts
PersistRecentFactory: any
```

### getStorage

```ts
getStorage: any
```

### createKeyParts

```ts
createKeyParts: any
```

### readRecentData

```ts
readRecentData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<IPublicSignalRow>
```

Reads the latest persisted recent signal for a given context.

Returns null if no recent signal exists.

### writeRecentData

```ts
writeRecentData: (signalRow: IPublicSignalRow, symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<void>
```

Writes the latest recent signal to disk with atomic file writes.

Uses symbol as the entity ID within the per-context storage instance.
Uses atomic writes to prevent corruption on crashes.

## Methods

### usePersistRecentAdapter

```ts
usePersistRecentAdapter(Ctor: TPersistBaseCtor<string, IPublicSignalRow>): void;
```

Registers a custom persistence adapter.

### clear

```ts
clear(): void;
```

Clears the memoized storage cache.
Call this when process.cwd() changes between strategy iterations
so new storage instances are created with the updated base path.

### useJson

```ts
useJson(): void;
```

Switches to the default JSON persist adapter.
All future persistence writes will use JSON storage.

### useDummy

```ts
useDummy(): void;
```

Switches to a dummy persist adapter that discards all writes.
All future persistence writes will be no-ops.
