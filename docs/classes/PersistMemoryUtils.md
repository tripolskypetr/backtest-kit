---
title: docs/class/PersistMemoryUtils
group: docs
---

# PersistMemoryUtils

Utility class for managing memory entry persistence.

Features:
- Memoized storage instances per (signalId, bucketName) pair
- Custom adapter support
- Atomic read/write/remove operations
- Async iteration over stored keys for index rebuilding

Storage layout: ./dump/memory/&lt;signalId&gt;/&lt;bucketName&gt;/&lt;memoryId&gt;.json

Used by MemoryPersistInstance for crash-safe memory persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistMemoryInstanceCtor

```ts
PersistMemoryInstanceCtor: any
```

Constructor used to create per-context memory instances.
Replaceable via usePersistMemoryAdapter() / useJson() / useDummy().

### getMemoryStorage

```ts
getMemoryStorage: any
```

Memoized factory creating one IPersistMemoryInstance per (signalId, bucketName) pair.

### waitForInit

```ts
waitForInit: (signalId: string, bucketName: string, initial: boolean) => Promise<void>
```

Initializes the memory storage for the given context.
Skips initialization when `initial` is false (used to gate first-time setup).

### readMemoryData

```ts
readMemoryData: (signalId: string, bucketName: string, memoryId: string) => Promise<MemoryData>
```

Reads a memory entry for the given context and id.
Lazily initializes the instance on first access.

### hasMemoryData

```ts
hasMemoryData: (signalId: string, bucketName: string, memoryId: string) => Promise<boolean>
```

Checks whether a memory entry exists on disk for the given context.
Lazily initializes the instance on first access.

### writeMemoryData

```ts
writeMemoryData: (data: MemoryData, signalId: string, bucketName: string, memoryId: string, when: Date) => Promise<void>
```

Writes a memory entry for the given context.
Lazily initializes the instance on first access.

### removeMemoryData

```ts
removeMemoryData: (signalId: string, bucketName: string, memoryId: string) => Promise<void>
```

Soft-deletes a memory entry for the given context.
Lazily initializes the instance on first access.

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

### usePersistMemoryAdapter

```ts
usePersistMemoryAdapter(Ctor: TPersistMemoryInstanceCtor): void;
```

Registers a custom IPersistMemoryInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.

### listMemoryData

```ts
listMemoryData(signalId: string, bucketName: string): AsyncGenerator<{
    memoryId: string;
    data: MemoryData;
}>;
```

Iterates all non-removed memory entries for the given context.
Used by MemoryPersistInstance to rebuild the BM25 index on init.
Lazily initializes the instance on first access.

### useJson

```ts
useJson(): void;
```

Switches to the default file-based PersistMemoryInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistMemoryDummyInstance (all operations are no-ops).
