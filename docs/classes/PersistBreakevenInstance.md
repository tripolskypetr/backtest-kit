---
title: docs/class/PersistBreakevenInstance
group: docs
---

# PersistBreakevenInstance

Implements `IPersistBreakevenInstance`

Default file-based implementation of IPersistBreakevenInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses signalId as entity ID within a per-context PersistBase
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

### readBreakevenData

```ts
readBreakevenData(signalId: string, _when: Date): Promise<BreakevenData>;
```

Reads the breakeven data for the given signal using `signalId` as the entity key.

### writeBreakevenData

```ts
writeBreakevenData(data: BreakevenData, signalId: string, _when: Date): Promise<void>;
```

Writes the breakeven data for the given signal using `signalId` as the entity key.
