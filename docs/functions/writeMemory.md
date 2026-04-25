---
title: docs/function/writeMemory
group: docs
---

# writeMemory

```ts
declare function writeMemory<T extends object = object>(dto: {
    bucketName: string;
    memoryId: string;
    value: T;
    description: string;
}): Promise<void>;
```

Writes a value to memory scoped to the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
