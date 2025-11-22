---
title: docs/api-reference/class/FrameSchemaService
group: docs
---

# FrameSchemaService

Service for managing frame schema registry.

Uses ToolRegistry from functools-kit for type-safe schema storage.
Frames are registered via addFrame() and retrieved by name.

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

### validateShallow

```ts
validateShallow: any
```

Validates frame schema structure for required properties.

Performs shallow validation to ensure all required properties exist
and have correct types before registration in the registry.

## Methods

### register

```ts
register(key: FrameName, value: IFrameSchema): void;
```

Registers a new frame schema.

### override

```ts
override(key: FrameName, value: Partial<IFrameSchema>): IFrameSchema;
```

Overrides an existing frame schema with partial updates.

### get

```ts
get(key: FrameName): IFrameSchema;
```

Retrieves a frame schema by name.
