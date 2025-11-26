---
title: docs/api-reference/class/RiskSchemaService
group: docs
---

# RiskSchemaService

Service for managing risk schema registry.

Uses ToolRegistry from functools-kit for type-safe schema storage.
Risk profiles are registered via addRisk() and retrieved by name.

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
register: (key: string, value: IRiskSchema) => void
```

Registers a new risk schema.

### validateShallow

```ts
validateShallow: any
```

Validates risk schema structure for required properties.

Performs shallow validation to ensure all required properties exist
and have correct types before registration in the registry.

### override

```ts
override: (key: string, value: Partial<IRiskSchema>) => IRiskSchema
```

Overrides an existing risk schema with partial updates.

### get

```ts
get: (key: string) => IRiskSchema
```

Retrieves a risk schema by name.
