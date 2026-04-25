---
title: docs/function/dumpTable
group: docs
---

# dumpTable

```ts
declare function dumpTable(dto: {
    bucketName: string;
    dumpId: string;
    rows: Record<string, unknown>[];
    description: string;
}): Promise<void>;
```

Dumps an array of objects as a table scoped to the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

Column headers are derived from the union of all keys across all rows.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
