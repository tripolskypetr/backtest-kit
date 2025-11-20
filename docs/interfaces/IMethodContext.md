---
title: docs/api-reference/interface/IMethodContext
group: docs
---

# IMethodContext

Method context containing schema names for operation routing.

Propagated through MethodContextService to provide implicit context
for retrieving correct strategy/exchange/frame instances.

## Properties

### exchangeName

```ts
exchangeName: string
```

Name of exchange schema to use

### strategyName

```ts
strategyName: string
```

Name of strategy schema to use

### frameName

```ts
frameName: string
```

Name of frame schema to use (empty string for live mode)
