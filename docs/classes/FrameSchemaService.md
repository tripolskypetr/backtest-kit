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

### _registry

```ts
_registry: any
```

## Methods

### register

```ts
register(key: FrameName, value: IFrameSchema): void;
```

Registers a new frame schema.

### override

```ts
override(key: FrameName, value: Partial<IFrameSchema>): void;
```

Overrides an existing frame schema with partial updates.

### get

```ts
get(key: FrameName): IFrameSchema;
```

Retrieves a frame schema by name.
