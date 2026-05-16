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
writeMemory: <T extends object = object>(memoryId: string, value: T, description: string, when: Date) => Promise<void>
```

Write a value to memory.

### searchMemory

```ts
searchMemory: <T extends object = object>(query: string, when: Date, settings?: SearchSettings) => Promise<{ memoryId: string; score: number; content: T; }[]>
```

Search memory using BM25 full-text scoring.
Filters out entries whose `when` is greater than the requested `when`.

### listMemory

```ts
listMemory: <T extends object = object>(when: Date) => Promise<{ memoryId: string; content: T; }[]>
```

List all entries in memory.
Filters out entries whose `when` is greater than the requested `when`.

### removeMemory

```ts
removeMemory: (memoryId: string, when: Date) => Promise<void>
```

Remove an entry from memory.

### readMemory

```ts
readMemory: <T extends object = object>(memoryId: string, when: Date) => Promise<T>
```

Read a single entry from memory.
Behaves as not-found if the stored `when` is greater than the requested `when`.

### dispose

```ts
dispose: () => void
```

Releases any resources held by this instance.
