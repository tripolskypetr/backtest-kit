---
title: docs/class/MemoryAdapter
group: docs
---

# MemoryAdapter

Implements `TMemoryInstance`

Facade for memory instances scoped per (signalId, bucketName).
Manages lazy initialization and instance lifecycle.

Features:
- Memoized instances per (signalId, bucketName) pair
- Swappable backend via useLocal(), usePersist(), useDummy()
- Default backend: MemoryPersistInstance (in-memory BM25 + persist storage)

## Constructor

```ts
constructor();
```

## Properties

### MemoryFactory

```ts
MemoryFactory: any
```

### getInstance

```ts
getInstance: any
```

### enable

```ts
enable: (() => (...args: any[]) => any) & ISingleshotClearable
```

Activates the adapter by subscribing to signal lifecycle events.
Clears memoized instances for a signalId when it is cancelled or closed,
preventing stale instances from accumulating in memory.
Idempotent — subsequent calls return the same subscription handle.
Must be called before any memory method is used.

### disable

```ts
disable: () => void
```

Deactivates the adapter by unsubscribing from signal lifecycle events.
No-op if enable() was never called.

### writeMemory

```ts
writeMemory: <T extends object = object>(dto: { memoryId: string; value: T; signalId: string; bucketName: string; description: string; }) => Promise<void>
```

Write a value to memory.

### searchMemory

```ts
searchMemory: <T extends object = object>(dto: { query: string; signalId: string; bucketName: string; settings?: SearchSettings; }) => Promise<{ memoryId: string; score: number; content: T; }[]>
```

Search memory using BM25 full-text scoring.

### listMemory

```ts
listMemory: <T extends object = object>(dto: { signalId: string; bucketName: string; }) => Promise<{ memoryId: string; content: T; }[]>
```

List all entries in memory.

### removeMemory

```ts
removeMemory: (dto: { memoryId: string; signalId: string; bucketName: string; }) => Promise<void>
```

Remove an entry from memory.

### readMemory

```ts
readMemory: <T extends object = object>(dto: { memoryId: string; signalId: string; bucketName: string; }) => Promise<T>
```

Read a single entry from memory.

### useLocal

```ts
useLocal: () => void
```

Switches to in-memory BM25 adapter (default).
All data lives in process memory only.

### usePersist

```ts
usePersist: () => void
```

Switches to file-system backed adapter.
Data is persisted to ./dump/memory/&lt;signalId&gt;/&lt;bucketName&gt;/.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy adapter that discards all writes.

### dispose

```ts
dispose: () => void
```

Releases resources held by this adapter.
Delegates to disable() to unsubscribe from signal lifecycle events.
