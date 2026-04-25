---
title: docs/class/PersistStateUtils
group: docs
---

# PersistStateUtils

Utility class for managing state persistence.

Features:
- Memoized storage instances per (signalId, bucketName) pair
- Custom adapter support
- Atomic read/write operations

Storage layout: ./dump/state/&lt;signalId&gt;/&lt;bucketName&gt;.json

Used by StatePersistInstance for crash-safe state persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistStateFactory

```ts
PersistStateFactory: any
```

### getStateStorage

```ts
getStateStorage: any
```

### waitForInit

```ts
waitForInit: (signalId: string, bucketName: string, initial: boolean) => Promise<void>
```

Initializes the storage for a given (signalId, bucketName) pair.

### readStateData

```ts
readStateData: (signalId: string, bucketName: string) => Promise<StateData>
```

Reads a state entry from persistence storage.

### writeStateData

```ts
writeStateData: (data: StateData, signalId: string, bucketName: string) => Promise<void>
```

Writes a state entry to disk with atomic file writes.

### useDummy

```ts
useDummy: () => void
```

Switches to a dummy persist adapter that discards all writes.
All future persistence writes will be no-ops.

### clear

```ts
clear: () => void
```

Clears the memoized storage cache.
Call this when process.cwd() changes between strategy iterations
so new storage instances are created with the updated base path.

### dispose

```ts
dispose: (signalId: string, bucketName: string) => void
```

Disposes of the state adapter and releases any resources.
Call this when a signal is removed to clean up its associated storage.

## Methods

### usePersistStateAdapter

```ts
usePersistStateAdapter(Ctor: TPersistBaseCtor<string, StateData>): void;
```

Registers a custom persistence adapter.
