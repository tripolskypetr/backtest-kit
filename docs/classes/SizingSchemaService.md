---
title: docs/class/SizingSchemaService
group: docs
---

# SizingSchemaService

Service for managing sizing schema registry.

Uses ToolRegistry from functools-kit for type-safe schema storage.
Sizing schemas are registered via addSizing() and retrieved by name.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
```

### _registry

```ts
_registry: any
```

### validateShallow

```ts
validateShallow: any
```

Validates sizing schema structure for required properties.

Performs shallow validation to ensure all required properties exist
and have correct types before registration in the registry.

## Methods

### register

```ts
register(key: SizingName, value: ISizingSchema): void;
```

Registers a new sizing schema.

### override

```ts
override(key: SizingName, value: Partial<ISizingSchema>): ISizingSchema;
```

Overrides an existing sizing schema with partial updates.

### get

```ts
get(key: SizingName): ISizingSchema;
```

Retrieves a sizing schema by name.
