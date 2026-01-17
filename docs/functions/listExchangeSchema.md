---
title: docs/function/listExchangeSchema
group: docs
---

# listExchangeSchema

```ts
declare function listExchangeSchema(): Promise<IExchangeSchema[]>;
```

Returns a list of all registered exchange schemas.

Retrieves all exchanges that have been registered via addExchange().
Useful for debugging, documentation, or building dynamic UIs.
