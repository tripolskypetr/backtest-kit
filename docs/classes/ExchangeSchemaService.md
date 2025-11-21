---
title: docs/api-reference/class/ExchangeSchemaService
group: docs
---

# ExchangeSchemaService

Service for managing exchange schema registry.

Uses ToolRegistry from functools-kit for type-safe schema storage.
Exchanges are registered via addExchange() and retrieved by name.

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

Registers a new exchange schema.

### validateShallow

```ts
validateShallow: any
```

Validates exchange schema structure for required properties.

Performs shallow validation to ensure all required properties exist
and have correct types before registration in the registry.

### override

```ts
override: (key: string, value: Partial<IExchangeSchema>) => IExchangeSchema
```

Overrides an existing exchange schema with partial updates.

### get

```ts
get: (key: string) => IExchangeSchema
```

Retrieves an exchange schema by name.
