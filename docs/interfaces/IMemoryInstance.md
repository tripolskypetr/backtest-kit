---
title: docs/interface/IMemoryInstance
group: docs
---

# IMemoryInstance

Interface for memory instance implementations.
Defines the contract for local, persist, and dummy backends.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize the memory instance.

### writeMemory

```ts
writeMemory: <T extends object = object>(memoryId: string, value: T, description: string) => Promise<void>
```

Write a value to memory.

### searchMemory

```ts
searchMemory: <T extends object = object>(query: string, settings?: SearchSettings) => Promise<{ memoryId: string; score: number; content: T; }[]>
```

Search memory using BM25 full-text scoring.

### listMemory

```ts
listMemory: <T extends object = object>() => Promise<{ memoryId: string; content: T; }[]>
```

List all entries in memory.

### removeMemory

```ts
removeMemory: (memoryId: string) => Promise<void>
```

Remove an entry from memory.

### readMemory

```ts
readMemory: <T extends object = object>(memoryId: string) => Promise<T>
```

Read a single entry from memory.

### dispose

```ts
dispose: () => void
```

Releases any resources held by this instance.
