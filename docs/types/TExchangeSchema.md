---
title: docs/type/TExchangeSchema
group: docs
---

# TExchangeSchema

```ts
type TExchangeSchema = {
    exchangeName: IExchangeSchema["exchangeName"];
} & Partial<IExchangeSchema>;
```

Partial exchange schema for override operations.

Requires only the exchange name identifier, all other fields are optional.
Used by overrideExchange() to perform partial updates without replacing entire configuration.
