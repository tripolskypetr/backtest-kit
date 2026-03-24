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

### PersistMemoryFactory

```ts
PersistMemoryFactory: any
```

### getMemoryStorage

```ts
getMemoryStorage: any
```

### waitForInit

```ts
waitForInit: (signalId: string, bucketName: string, initial: boolean) => Promise<void>
```

Initializes the storage for a given (signalId, bucketName) pair.

### readMemoryData

```ts
readMemoryData: (signalId: string, bucketName: string, memoryId: string) => Promise<MemoryData>
```

Reads a memory entry from persistence storage.

### hasMemoryData

```ts
hasMemoryData: (signalId: string, bucketName: string, memoryId: string) => Promise<boolean>
```

Checks if a memory entry exists in persistence storage.

### writeMemoryData

```ts
writeMemoryData: (data: MemoryData, signalId: string, bucketName: string, memoryId: string) => Promise<void>
```

Writes a memory entry to disk with atomic file writes.

### removeMemoryData

```ts
removeMemoryData: (signalId: string, bucketName: string, memoryId: string) => Promise<void>
```

Marks a memory entry as removed (soft delete — file is kept on disk).

### clear

```ts
clear: (signalId: string, bucketName: string) => void
```

Dispose persist adapter to prevent memory leak

## Methods

### usePersistMemoryAdapter

```ts
usePersistMemoryAdapter(Ctor: TPersistBaseCtor<string, MemoryData>): void;
```

Registers a custom persistence adapter.

### listMemoryData

```ts
listMemoryData(signalId: string, bucketName: string): AsyncGenerator<{
    memoryId: string;
    data: MemoryData;
}>;
```

Lists all memory entry IDs for a given (signalId, bucketName) pair.
Used by MemoryPersistInstance to rebuild the BM25 index on init.

### useJson

```ts
useJson(): void;
```

Switches to the default JSON persist adapter.
All future persistence writes will use JSON storage.

### useDummy

```ts
useDummy(): void;
```

Switches to a dummy persist adapter that discards all writes.
All future persistence writes will be no-ops.
