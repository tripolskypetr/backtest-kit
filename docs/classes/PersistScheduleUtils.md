---
title: docs/api-reference/class/PersistScheduleUtils
group: docs
---

# PersistScheduleUtils

Utility class for managing scheduled signal persistence.

Features:
- Memoized storage instances per strategy
- Custom adapter support
- Atomic read/write operations for scheduled signals
- Crash-safe scheduled signal state management

Used by ClientStrategy for live mode persistence of scheduled signals (_scheduledSignal).

## Constructor

```ts
constructor();
```

## Properties

### PersistScheduleFactory

```ts
PersistScheduleFactory: any
```

### getScheduleStorage

```ts
getScheduleStorage: any
```

### readScheduleData

```ts
readScheduleData: (strategyName: string, symbol: string) => Promise<IScheduledSignalRow>
```

Reads persisted scheduled signal data for a strategy and symbol.

Called by ClientStrategy.waitForInit() to restore scheduled signal state.
Returns null if no scheduled signal exists.

### writeScheduleData

```ts
writeScheduleData: (scheduledSignalRow: IScheduledSignalRow, strategyName: string, symbol: string) => Promise<void>
```

Writes scheduled signal data to disk with atomic file writes.

Called by ClientStrategy.setScheduledSignal() to persist state.
Uses atomic writes to prevent corruption on crashes.

## Methods

### usePersistScheduleAdapter

```ts
usePersistScheduleAdapter(Ctor: TPersistBaseCtor<StrategyName, ScheduleData>): void;
```

Registers a custom persistence adapter.
