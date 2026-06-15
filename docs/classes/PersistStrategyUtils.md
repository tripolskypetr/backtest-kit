---
title: docs/class/PersistStrategyUtils
group: docs
---

# PersistStrategyUtils

Utility class for managing deferred strategy state persistence.

Features:
- Memoized storage instances per strategy
- Custom adapter support
- Atomic read/write operations for the deferred state snapshot
- Crash-safe in-flight broker operation state management

Used by ClientStrategy for live mode persistence of the commit queue and deferred
user actions (_commitQueue, _closedSignal, _cancelledSignal, _activatedSignal).

## Constructor

```ts
constructor();
```

## Properties

### PersistStrategyInstanceCtor

```ts
PersistStrategyInstanceCtor: any
```

Constructor used to create per-context strategy state instances.
Replaceable via usePersistStrategyAdapter() / useJson() / useDummy().

### getStrategyStorage

```ts
getStrategyStorage: any
```

Memoized factory creating one IPersistStrategyInstance per (symbol, strategy, exchange) triple.

### readStrategyData

```ts
readStrategyData: (symbol: string, strategyName: string, exchangeName: string) => Promise<StrategyData>
```

Reads persisted deferred strategy state for the given context.
Lazily initializes the instance on first access.

### writeStrategyData

```ts
writeStrategyData: (strategyRow: StrategyData, symbol: string, strategyName: string, exchangeName: string) => Promise<void>
```

Writes deferred strategy state (or null to clear) for the given context.
Lazily initializes the instance on first access.

## Methods

### usePersistStrategyAdapter

```ts
usePersistStrategyAdapter(Ctor: TPersistStrategyInstanceCtor): void;
```

Registers a custom IPersistStrategyInstance constructor.
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

Switches to the default file-based PersistStrategyInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistStrategyDummyInstance (all operations are no-ops).
