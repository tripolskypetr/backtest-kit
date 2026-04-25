---
title: docs/class/MemoryLiveAdapter
group: docs
---

# MemoryLiveAdapter

Implements `TMemoryInstance`

Live trading memory adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable memory instance implementations
- Default backend: MemoryPersistInstance (file-system backed, survives restarts)
- Alternative backends: MemoryLocalInstance, MemoryDummyInstance
- Convenience methods: useLocal(), usePersist(), useDummy(), useMemoryAdapter()
- Memoized instances per (signalId, bucketName) pair; cleared via disposeSignal() from MemoryAdapter

Use this adapter for live trading memory storage.

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

### disposeSignal

```ts
disposeSignal: (signalId: string) => void
```

Disposes all memoized instances for the given signalId.
Called by MemoryAdapter when a signal is cancelled or closed.

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

Switches to in-memory BM25 adapter.
All data lives in process memory only.

### usePersist

```ts
usePersist: () => void
```

Switches to file-system backed adapter (default).
Data is persisted to ./dump/memory/&lt;signalId&gt;/&lt;bucketName&gt;/.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy adapter that discards all writes.

### useMemoryAdapter

```ts
useMemoryAdapter: (Ctor: TMemoryInstanceCtor) => void
```

Switches to a custom memory adapter implementation.

### clear

```ts
clear: () => void
```

Clears the memoized instance cache.
Call this when process.cwd() changes between strategy iterations
so new instances are created with the updated base path.
