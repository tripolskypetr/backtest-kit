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

### PersistRecentInstanceCtor

```ts
PersistRecentInstanceCtor: any
```

Constructor used to create per-context recent signal instances.
Replaceable via usePersistRecentAdapter() / useJson() / useDummy().

### createKey

```ts
createKey: any
```

Builds the composite memoization key for a recent signal context.
Includes optional frameName and the backtest/live mode flag.

### getStorage

```ts
getStorage: any
```

Memoized factory creating one IPersistRecentInstance per context tuple.

### readRecentData

```ts
readRecentData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<IPublicSignalRow>
```

Reads the latest recent signal for the given context.
Lazily initializes the instance on first access.

### writeRecentData

```ts
writeRecentData: (signalRow: IPublicSignalRow, symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, when: Date) => Promise<void>
```

Writes the latest recent signal for the given context.
Lazily initializes the instance on first access.

## Methods

### usePersistRecentAdapter

```ts
usePersistRecentAdapter(Ctor: TPersistRecentInstanceCtor): void;
```

Registers a custom IPersistRecentInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.

### clear

```ts
clear(): void;
```

Clears the memoized instance cache.
Call when process.cwd() changes between strategy iterations.

### useJson

```ts
useJson(): void;
```

Switches to the default file-based PersistRecentInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistRecentDummyInstance (all operations are no-ops).
