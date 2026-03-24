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

Reads symbol from execution context and signalId from the active pending signal.
If no pending signal exists, logs a warning and returns without writing.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
