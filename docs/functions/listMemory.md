---
title: docs/function/listMemory
group: docs
---

# listMemory

```ts
declare function listMemory<T extends object = object>(dto: {
    bucketName: string;
}): Promise<Array<{
    memoryId: string;
    content: T;
}>>;
```

Lists all memory entries for the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
