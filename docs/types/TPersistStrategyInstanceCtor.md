---
title: docs/type/TPersistStrategyInstanceCtor
group: docs
---

# TPersistStrategyInstanceCtor

```ts
type TPersistStrategyInstanceCtor = new (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName) => IPersistStrategyInstance;
```

Constructor type for IPersistStrategyInstance.
Used by PersistStrategyUtils.usePersistStrategyAdapter() to register custom adapters.
