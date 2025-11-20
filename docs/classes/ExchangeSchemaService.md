---
title: docs/api-reference/class/ExchangeSchemaService
group: docs
---

# ExchangeSchemaService

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
register: (key: string, value: IExchangeSchema) => void
```

### override

```ts
override: (key: string, value: Partial<IExchangeSchema>) => IExchangeSchema
```

### get

```ts
get: (key: string) => IExchangeSchema
```
