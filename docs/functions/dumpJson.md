---
title: docs/function/dumpJson
group: docs
---

# dumpJson

```ts
declare function dumpJson(dto: {
    bucketName: string;
    dumpId: string;
    json: object;
    description: string;
}): Promise<void>;
```

Dumps an arbitrary nested object as a fenced JSON block scoped to the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
