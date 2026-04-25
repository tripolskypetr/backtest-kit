---
title: docs/function/dumpText
group: docs
---

# dumpText

```ts
declare function dumpText(dto: {
    bucketName: string;
    dumpId: string;
    content: string;
    description: string;
}): Promise<void>;
```

Dumps raw text content scoped to the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
