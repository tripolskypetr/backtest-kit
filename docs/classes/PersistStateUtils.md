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

### PersistStateInstanceCtor

```ts
PersistStateInstanceCtor: any
```

Constructor used to create per-context state instances.
Replaceable via usePersistStateAdapter() / useJson() / useDummy().

### getStateStorage

```ts
getStateStorage: any
```

Memoized factory creating one IPersistStateInstance per (signalId, bucketName) pair.

### waitForInit

```ts
waitForInit: (signalId: string, bucketName: string, initial: boolean) => Promise<void>
```

Initializes the state storage for the given context.
Skips initialization when `initial` is false (used to gate first-time setup).

### readStateData

```ts
readStateData: (signalId: string, bucketName: string) => Promise<StateData>
```

Reads persisted state for the given context.
Lazily initializes the instance on first access.

### writeStateData

```ts
writeStateData: (data: StateData, signalId: string, bucketName: string, when: Date) => Promise<void>
```

Writes state for the given context.
Lazily initializes the instance on first access.

### useDummy

```ts
useDummy: () => void
```

Switches to PersistStateDummyInstance (all operations are no-ops).

### useJson

```ts
useJson: () => void
```

Switches to the default file-based PersistStateInstance.

### clear

```ts
clear: () => void
```

Clears the memoized instance cache.
Call when process.cwd() changes between strategy iterations.

### dispose

```ts
dispose: (signalId: string, bucketName: string) => void
```

Drops the memoized instance for the given context.
Call when a signal is removed to clean up its associated storage entry.

## Methods

### usePersistStateAdapter

```ts
usePersistStateAdapter(Ctor: TPersistStateInstanceCtor): void;
```

Registers a custom IPersistStateInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.
