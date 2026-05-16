---
title: docs/interface/IPersistBreakevenInstance
group: docs
---

# IPersistBreakevenInstance

Per-context breakeven state persistence instance interface.
Scoped to a specific (symbol, strategyName, exchangeName) triple.

Each signal's breakeven data is stored under its own signalId key within
the context-scoped storage.

Custom adapters should implement this interface to override the default
file-based breakeven persistence behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this breakeven context.

### readBreakevenData

```ts
readBreakevenData: (signalId: string, when: Date) => Promise<BreakevenData>
```

Read persisted breakeven data for a specific signal.

### writeBreakevenData

```ts
writeBreakevenData: (data: BreakevenData, signalId: string, when: Date) => Promise<void>
```

Write breakeven data for a specific signal.
