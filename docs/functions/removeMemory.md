---
title: docs/function/removeMemory
group: docs
---

# removeMemory

```ts
declare function removeMemory(dto: {
    bucketName: string;
    memoryId: string;
}): Promise<void>;
```

Removes a memory entry for the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
