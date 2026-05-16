---
title: docs/interface/IPersistPartialInstance
group: docs
---

# IPersistPartialInstance

Per-context partial profit/loss levels persistence instance interface.
Scoped to a specific (symbol, strategyName, exchangeName) triple.

Each signal's partial data is stored under its own signalId key within
the context-scoped storage.

Custom adapters should implement this interface to override the default
file-based partial data persistence behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this partial context.

### readPartialData

```ts
readPartialData: (signalId: string, when: Date) => Promise<PartialData>
```

Read persisted partial data for a specific signal.

### writePartialData

```ts
writePartialData: (data: PartialData, signalId: string, when: Date) => Promise<void>
```

Write partial data for a specific signal.
