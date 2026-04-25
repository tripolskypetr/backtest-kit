---
title: docs/function/searchMemory
group: docs
---

# searchMemory

```ts
declare function searchMemory<T extends object = object>(dto: {
    bucketName: string;
    query: string;
}): Promise<Array<{
    memoryId: string;
    score: number;
    content: T;
}>>;
```

Searches memory entries for the current signal using BM25 full-text scoring.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
