---
title: docs/class/PersistPartialUtils
group: docs
---

# PersistPartialUtils

Utility class for managing partial profit/loss levels persistence.

Features:
- Memoized storage instances per symbol:strategyName
- Custom adapter support
- Atomic read/write operations for partial data
- Crash-safe partial state management

Used by ClientPartial for live mode persistence of profit/loss levels.

## Constructor

```ts
constructor();
```

## Properties

### PersistPartialInstanceCtor

```ts
PersistPartialInstanceCtor: any
```

Constructor used to create per-context partial data instances.
Replaceable via usePersistPartialAdapter() / useJson() / useDummy().

### getPartialStorage

```ts
getPartialStorage: any
```

Memoized factory creating one IPersistPartialInstance per (symbol, strategy, exchange) triple.
Each signal's partial data is stored under its own signalId within the instance.

### readPartialData

```ts
readPartialData: (symbol: string, strategyName: string, signalId: string, exchangeName: string, when: Date) => Promise<PartialData>
```

Reads partial data for the given context and signalId.
Lazily initializes the instance on first access.

### writePartialData

```ts
writePartialData: (partialData: PartialData, symbol: string, strategyName: string, signalId: string, exchangeName: string, when: Date) => Promise<void>
```

Writes partial data for the given context and signalId.
Lazily initializes the instance on first access.

## Methods

### usePersistPartialAdapter

```ts
usePersistPartialAdapter(Ctor: TPersistPartialInstanceCtor): void;
```

Registers a custom IPersistPartialInstance constructor.
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

Switches to the default file-based PersistPartialInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistPartialDummyInstance (all operations are no-ops).
