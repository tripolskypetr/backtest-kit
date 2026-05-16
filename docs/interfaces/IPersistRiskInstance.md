---
title: docs/interface/IPersistRiskInstance
group: docs
---

# IPersistRiskInstance

Per-context risk positions persistence instance interface.
Scoped to a specific (riskName, exchangeName) pair.

Custom adapters should implement this interface to override the default
file-based active positions persistence behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this risk context.

### readPositionData

```ts
readPositionData: (when: Date) => Promise<RiskData>
```

Read persisted active positions for this context.

### writePositionData

```ts
writePositionData: (riskRow: RiskData, when: Date) => Promise<void>
```

Write active positions for this context.
