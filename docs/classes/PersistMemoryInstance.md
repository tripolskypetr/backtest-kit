---
title: docs/class/PersistMemoryInstance
group: docs
---

# PersistMemoryInstance

Implements `IPersistMemoryInstance`

Default file-based implementation of IPersistMemoryInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Soft delete via `removed: true` flag
- listMemoryData filters out removed entries
- dispose is a no-op (memo cache is managed by PersistMemoryUtils)

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

### readMemoryData

```ts
readMemoryData(memoryId: string): Promise<MemoryData | null>;
```

Reads a memory entry by id. Returns null if entry is missing or soft-deleted.

### hasMemoryData

```ts
hasMemoryData(memoryId: string): Promise<boolean>;
```

Checks whether a memory entry exists on disk (regardless of removed flag).

### writeMemoryData

```ts
writeMemoryData(data: MemoryData, memoryId: string, _when: Date): Promise<void>;
```

Writes a memory entry under the given id.

### removeMemoryData

```ts
removeMemoryData(memoryId: string): Promise<void>;
```

Soft-deletes a memory entry by writing `removed: true` flag.

### listMemoryData

```ts
listMemoryData(): AsyncGenerator<{
    memoryId: string;
    data: MemoryData;
}>;
```

Iterates all memory entries in the bucket, yielding id + data tuples
for non-removed entries only.

### dispose

```ts
dispose(): void;
```

No-op for the default file-based implementation.
Resource cleanup (memo cache invalidation) is handled by PersistMemoryUtils.dispose().
