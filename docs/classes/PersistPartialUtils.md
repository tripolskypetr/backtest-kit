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

### PersistPartialFactory

```ts
PersistPartialFactory: any
```

### getPartialStorage

```ts
getPartialStorage: any
```

### readPartialData

```ts
readPartialData: (symbol: string, strategyName: string, signalId: string, exchangeName: string) => Promise<PartialData>
```

Reads persisted partial data for a symbol and strategy.

Called by ClientPartial.waitForInit() to restore state.
Returns empty object if no partial data exists.

### writePartialData

```ts
writePartialData: (partialData: PartialData, symbol: string, strategyName: string, signalId: string, exchangeName: string) => Promise<void>
```

Writes partial data to disk with atomic file writes.

Called by ClientPartial after profit/loss level changes to persist state.
Uses atomic writes to prevent corruption on crashes.

## Methods

### usePersistPartialAdapter

```ts
usePersistPartialAdapter(Ctor: TPersistBaseCtor<string, PartialData>): void;
```

Registers a custom persistence adapter.
