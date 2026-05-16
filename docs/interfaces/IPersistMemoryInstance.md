---
title: docs/interface/IPersistMemoryInstance
group: docs
---

# IPersistMemoryInstance

Per-context memory entry persistence instance interface.
Scoped to a specific (signalId, bucketName) pair.

Used by MemoryPersistInstance for LLM memory storage. Supports soft delete
via `removed: true` flag — soft-deleted entries stay on disk but are
filtered out by read/list operations.

Custom adapters should implement this interface to override the default
file-based memory entry behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this memory context.

### readMemoryData

```ts
readMemoryData: (memoryId: string) => Promise<MemoryData>
```

Read a memory entry by id.

### hasMemoryData

```ts
hasMemoryData: (memoryId: string) => Promise<boolean>
```

Check whether a memory entry exists (regardless of removed flag).

### writeMemoryData

```ts
writeMemoryData: (data: MemoryData, memoryId: string, when: Date) => Promise<void>
```

Write a memory entry.

### removeMemoryData

```ts
removeMemoryData: (memoryId: string) => Promise<void>
```

Soft-delete a memory entry. File stays on disk; subsequent reads return null.

### listMemoryData

```ts
listMemoryData: () => AsyncGenerator<{ memoryId: string; data: MemoryData; }, any, any>
```

Iterate all non-removed memory entries for this context.
Used by MemoryPersistInstance to rebuild the BM25 index on init.

### dispose

```ts
dispose: () => void
```

Release any resources held by this instance.
Default implementations may treat this as a no-op.
