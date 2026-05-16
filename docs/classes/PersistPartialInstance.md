---
title: docs/class/PersistPartialInstance
group: docs
---

# PersistPartialInstance

Implements `IPersistPartialInstance`

Default file-based implementation of IPersistPartialInstance.

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

### readPartialData

```ts
readPartialData(signalId: string, _when: Date): Promise<PartialData>;
```

Reads the partial data for the given signal using `signalId` as the entity key.

### writePartialData

```ts
writePartialData(data: PartialData, signalId: string, _when: Date): Promise<void>;
```

Writes the partial data for the given signal using `signalId` as the entity key.
