---
title: docs/function/overrideExchangeSchema
group: docs
---

# overrideExchangeSchema

```ts
declare function overrideExchangeSchema(exchangeSchema: TExchangeSchema): Promise<IExchangeSchema>;
```

Overrides an existing exchange data source in the framework.

This function partially updates a previously registered exchange with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `exchangeSchema` | Partial exchange configuration object |
