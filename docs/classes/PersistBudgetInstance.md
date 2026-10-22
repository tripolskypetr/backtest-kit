---
title: docs/class/PersistBudgetInstance
group: docs
---

# PersistBudgetInstance

Implements `IPersistBudgetInstance`

Default file-based implementation of IPersistBudgetInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses the budget name as entity ID within a per-record PersistBase
- dispose is a no-op (memo cache is managed by PersistBudgetUtils)

Storage layout: ./dump/budget/&lt;strategyName&gt;:&lt;exchangeName&gt;:&lt;frameName&gt;:<backtest&vert;live>/<name>.json
— no signalId anywhere in the path: the record is shared by every symbol of the run.

## Constructor

```ts
constructor(key: BudgetRecordKey, name: string);
```

## Properties

### key

```ts
key: BudgetRecordKey
```

### name

```ts
name: string
```

### _storage

```ts
_storage: any
```

Underlying file-based storage scoped to this context

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the underlying PersistBase storage.

### readBudgetData

```ts
readBudgetData(): Promise<BudgetData | null>;
```

Reads the persisted budget record using `name` as the entity key.

### writeBudgetData

```ts
writeBudgetData(data: BudgetData, _when: Date): Promise<void>;
```

Writes the budget record using `name` as the entity key.

### dispose

```ts
dispose(): void;
```

No-op for the default file-based implementation.
Resource cleanup (memo cache invalidation) is handled by PersistBudgetUtils.dispose().
