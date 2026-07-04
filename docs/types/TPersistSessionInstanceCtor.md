---
title: docs/type/TPersistSessionInstanceCtor
group: docs
---

# TPersistSessionInstanceCtor

```ts
type TPersistSessionInstanceCtor = new (strategyName: string, exchangeName: string, frameName: string, symbol: string, backtest: boolean) => IPersistSessionInstance;
```

Constructor type for IPersistSessionInstance.
Used by PersistSessionUtils.usePersistSessionAdapter() to register custom adapters.
