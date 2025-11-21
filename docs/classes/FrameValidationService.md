---
title: docs/api-reference/class/FrameValidationService
group: docs
---

# FrameValidationService

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### _frameMap

```ts
_frameMap: any
```

### addFrame

```ts
addFrame: (frameName: string, frameSchema: IFrameSchema) => void
```

Adds a frame schema to the validation service

### validate

```ts
validate: (frameName: string, source: string) => void
```

Validates the existence of a frame
