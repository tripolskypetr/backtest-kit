---
title: docs/class/PersistSignalUtils
group: docs
---

# PersistSignalUtils

Utility class for managing signal persistence.

Features:
- Memoized storage instances per strategy
- Custom adapter support
- Atomic read/write operations
- Crash-safe signal state management

Used by ClientStrategy for live mode persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistSignalFactory

```ts
PersistSignalFactory: any
```

### getSignalStorage

```ts
getSignalStorage: any
```

### readSignalData

```ts
readSignalData: (symbol: string, strategyName: string, exchangeName: string) => Promise<ISignalRow>
```

Reads persisted signal data for a symbol and strategy.

Called by ClientStrategy.waitForInit() to restore state.
Returns null if no signal exists.

### writeSignalData

```ts
writeSignalData: (signalRow: ISignalRow, symbol: string, strategyName: string, exchangeName: string) => Promise<void>
```

Writes signal data to disk with atomic file writes.

Called by ClientStrategy.setPendingSignal() to persist state.
Uses atomic writes to prevent corruption on crashes.

## Methods

### usePersistSignalAdapter

```ts
usePersistSignalAdapter(Ctor: TPersistBaseCtor<StrategyName, SignalData>): void;
```

Registers a custom persistence adapter.
