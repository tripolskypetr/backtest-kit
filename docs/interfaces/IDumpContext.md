---
title: docs/interface/IDumpContext
group: docs
---

# IDumpContext

Context required to identify a dump entry.
Passed only through DumpAdapter - instances receive signalId, bucketName, and backtest via constructor.

## Properties

### signalId

```ts
signalId: string
```

Signal identifier - scopes the dump to a specific trade

### bucketName

```ts
bucketName: string
```

Bucket name - groups dumps by strategy or agent name

### dumpId

```ts
dumpId: string
```

Unique identifier for this dump entry

### description

```ts
description: string
```

Human-readable label describing the dump contents; included in the BM25 index for Memory search and rendered in Markdown output

### backtest

```ts
backtest: boolean
```

Flag indicating if the context is backtest or live; routed to Memory.writeMemory
