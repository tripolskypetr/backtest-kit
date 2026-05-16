---
title: docs/interface/IPersistRecentInstance
group: docs
---

# IPersistRecentInstance

Per-context recent signal persistence instance interface.
Scoped to a specific (symbol, strategyName, exchangeName, frameName, backtest) tuple.

Stores the latest active signal for the given context, allowing live/backtest
separation. Custom adapters should implement this interface to override the
default file-based recent signal behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this recent signal context.

### readRecentData

```ts
readRecentData: () => Promise<IPublicSignalRow>
```

Read the latest persisted recent signal for this context.

### writeRecentData

```ts
writeRecentData: (signalRow: IPublicSignalRow, when: Date) => Promise<void>
```

Write the latest recent signal for this context.
