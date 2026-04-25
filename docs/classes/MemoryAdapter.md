---
title: docs/class/MemoryAdapter
group: docs
---

# MemoryAdapter

Main memory adapter that manages both backtest and live memory storage.

Features:
- Subscribes to signal lifecycle events (cancelled/closed) to dispose stale instances
- Routes all operations to MemoryBacktest or MemoryLive based on dto.backtest
- Singleshot enable pattern prevents duplicate subscriptions
- Cleanup function for proper unsubscription

## Constructor

```ts
constructor();
```

## Properties

### enable

```ts
enable: (() => (...args: any[]) => any) & ISingleshotClearable<() => (...args: any[]) => any>
```

Enables memory storage by subscribing to signal lifecycle events.
Clears memoized instances in MemoryBacktest and MemoryLive when a signal
is cancelled or closed, preventing stale instances from accumulating.
Uses singleshot to ensure one-time subscription.

### disable

```ts
disable: () => void
```

Disables memory storage by unsubscribing from signal lifecycle events.
Safe to call multiple times.

### writeMemory

```ts
writeMemory: <T extends object = object>(dto: { memoryId: string; value: T; signalId: string; bucketName: string; description: string; backtest: boolean; }) => Promise<void>
```

Write a value to memory.
Routes to MemoryBacktest or MemoryLive based on dto.backtest.

### searchMemory

```ts
searchMemory: <T extends object = object>(dto: { query: string; signalId: string; bucketName: string; settings?: SearchSettings; backtest: boolean; }) => Promise<{ memoryId: string; score: number; content: T; }[]>
```

Search memory using BM25 full-text scoring.
Routes to MemoryBacktest or MemoryLive based on dto.backtest.

### listMemory

```ts
listMemory: <T extends object = object>(dto: { signalId: string; bucketName: string; backtest: boolean; }) => Promise<{ memoryId: string; content: T; }[]>
```

List all entries in memory.
Routes to MemoryBacktest or MemoryLive based on dto.backtest.

### removeMemory

```ts
removeMemory: (dto: { memoryId: string; signalId: string; bucketName: string; backtest: boolean; }) => Promise<void>
```

Remove an entry from memory.
Routes to MemoryBacktest or MemoryLive based on dto.backtest.

### readMemory

```ts
readMemory: <T extends object = object>(dto: { memoryId: string; signalId: string; bucketName: string; backtest: boolean; }) => Promise<T>
```

Read a single entry from memory.
Routes to MemoryBacktest or MemoryLive based on dto.backtest.
