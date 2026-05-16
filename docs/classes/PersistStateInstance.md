---
title: docs/class/PersistStateInstance
group: docs
---

# PersistStateInstance

Implements `IPersistStateInstance`

Default file-based implementation of IPersistStateInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses bucketName as entity ID within a per-signal PersistBase
- dispose is a no-op (memo cache is managed by PersistStateUtils)

## Constructor

```ts
constructor(signalId: string, bucketName: string);
```

## Properties

### signalId

```ts
signalId: string
```

### bucketName

```ts
bucketName: string
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

### readStateData

```ts
readStateData(): Promise<StateData | null>;
```

Reads the persisted state using `bucketName` as the entity key.

### writeStateData

```ts
writeStateData(data: StateData, _when: Date): Promise<void>;
```

Writes the state using `bucketName` as the entity key.

### dispose

```ts
dispose(): void;
```

No-op for the default file-based implementation.
Resource cleanup (memo cache invalidation) is handled by PersistStateUtils.dispose().
