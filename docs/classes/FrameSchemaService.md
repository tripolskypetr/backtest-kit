---
title: docs/api-reference/class/FrameSchemaService
group: docs
---

# FrameSchemaService

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

### override

```ts
override(key: FrameName, value: Partial<IFrameSchema>): void;
```

### get

```ts
get(key: FrameName): IFrameSchema;
```
