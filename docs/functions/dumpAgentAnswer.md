---
title: docs/function/dumpAgentAnswer
group: docs
---

# dumpAgentAnswer

```ts
declare function dumpAgentAnswer(dto: {
    bucketName: string;
    dumpId: string;
    messages: MessageModel[];
    description: string;
}): Promise<void>;
```

Dumps the full agent message history scoped to the current signal.

Resolves the active pending or scheduled signal automatically from execution context.
Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `dto` | |
