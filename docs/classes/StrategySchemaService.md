---
title: docs/api-reference/class/StrategySchemaService
group: docs
---

# StrategySchemaService

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: LoggerService
```

### _registry

```ts
_registry: any
```

### register

```ts
register: (key: string, value: IStrategySchema) => void
```

### override

```ts
override: (key: string, value: Partial<IStrategySchema>) => IStrategySchema
```

### get

```ts
get: (key: string) => IStrategySchema
```
