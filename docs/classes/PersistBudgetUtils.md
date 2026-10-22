---
title: docs/class/PersistBudgetUtils
group: docs
---

# PersistBudgetUtils

Utility class for managing budget persistence.

Features:
- Memoized storage instances per (record key, name) pair
- Custom adapter support
- Atomic read/write operations

Storage layout: ./dump/budget/&lt;strategyName&gt;:&lt;exchangeName&gt;:&lt;frameName&gt;:<backtest&vert;live>/<name>.json

Used by BudgetPersistInstance for crash-safe budget journal persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistBudgetInstanceCtor

```ts
PersistBudgetInstanceCtor: any
```

Constructor used to create per-context budget instances.
Replaceable via usePersistBudgetAdapter() / useJson() / useDummy().

### getBudgetStorage

```ts
getBudgetStorage: any
```

Memoized factory creating one IPersistBudgetInstance per (record key, name) pair.

### waitForInit

```ts
waitForInit: (key: BudgetRecordKey, name: string, initial: boolean) => Promise<void>
```

Initializes the budget storage for the given context.
Skips initialization when `initial` is false (used to gate first-time setup).

### readBudgetData

```ts
readBudgetData: (key: BudgetRecordKey, name: string) => Promise<BudgetData>
```

Reads the persisted budget record for the given context.
Lazily initializes the instance on first access.

### writeBudgetData

```ts
writeBudgetData: (data: BudgetData, key: BudgetRecordKey, name: string, when: Date) => Promise<void>
```

Writes the budget record for the given context.
Lazily initializes the instance on first access.

### useDummy

```ts
useDummy: () => void
```

Switches to PersistBudgetDummyInstance (all operations are no-ops).

### useJson

```ts
useJson: () => void
```

Switches to the default file-based PersistBudgetInstance.

### clear

```ts
clear: () => void
```

Clears the memoized instance cache.
Call when process.cwd() changes between strategy iterations.

### dispose

```ts
dispose: (key: BudgetRecordKey, name: string) => void
```

Drops the memoized instance for the given context.
Call when a budget record is cleared to clean up its associated storage entry.

## Methods

### usePersistBudgetAdapter

```ts
usePersistBudgetAdapter(Ctor: TPersistBudgetInstanceCtor): void;
```

Registers a custom IPersistBudgetInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.
