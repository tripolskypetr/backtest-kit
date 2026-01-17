---
title: docs/function/overrideStrategySchema
group: docs
---

# overrideStrategySchema

```ts
declare function overrideStrategySchema(strategySchema: TStrategySchema): Promise<IStrategySchema>;
```

Overrides an existing trading strategy in the framework.

This function partially updates a previously registered strategy with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `strategySchema` | Partial strategy configuration object |
