---
title: docs/function/readMemory
group: docs
---

# readMemory

```ts
declare function readMemory<T extends object = object>(dto: {
    bucketName: string;
    memoryId: string;
}): Promise<T>;
```

Reads a value from memory scoped to the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
