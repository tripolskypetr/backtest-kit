---
title: docs/interface/IPersistStrategyInstance
group: docs
---

# IPersistStrategyInstance

Per-context deferred strategy state persistence instance interface.
Scoped to a specific (symbol, strategyName, exchangeName) triple.

Custom adapters should implement this interface to override the default
file-based deferred strategy state persistence behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this strategy state context.

### readStrategyData

```ts
readStrategyData: () => Promise<StrategyData>
```

Read persisted deferred strategy state for this context.

### writeStrategyData

```ts
writeStrategyData: (row: StrategyData) => Promise<void>
```

Write deferred strategy state for this context (null to clear).
