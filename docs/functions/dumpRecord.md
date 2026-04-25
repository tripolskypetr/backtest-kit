---
title: docs/function/dumpRecord
group: docs
---

# dumpRecord

```ts
declare function dumpRecord(dto: {
    bucketName: string;
    dumpId: string;
    record: Record<string, unknown>;
    description: string;
}): Promise<void>;
```

Dumps a flat key-value record scoped to the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
