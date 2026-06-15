---
title: docs/class/PersistStrategyInstance
group: docs
---

# PersistStrategyInstance

Implements `IPersistStrategyInstance`

Default file-based implementation of IPersistStrategyInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses fixed entity ID "strategy" within a per-context PersistBase
- Crash-safe via atomic writes

## Constructor

```ts
constructor(symbol: string, strategyName: string, exchangeName: string);
```

## Properties

### symbol

```ts
symbol: string
```

### strategyName

```ts
strategyName: string
```

### exchangeName

```ts
exchangeName: string
```

### STORAGE_KEY

```ts
STORAGE_KEY: any
```

Fixed entity key for storing the strategy state snapshot

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

### readStrategyData

```ts
readStrategyData(): Promise<StrategyData | null>;
```

Reads the persisted strategy state snapshot using the fixed STORAGE_KEY.

### writeStrategyData

```ts
writeStrategyData(row: StrategyData | null): Promise<void>;
```

Writes the strategy state snapshot (or null to clear) using the fixed STORAGE_KEY.
