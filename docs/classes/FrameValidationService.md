---
title: docs/api-reference/class/FrameValidationService
group: docs
---

# FrameValidationService

Service for managing and validating frame (timeframe) configurations.

Maintains a registry of all configured frames and validates
their existence before operations. Uses memoization for performance.

Key features:
- Registry management: addFrame() to register new timeframes
- Validation: validate() ensures frame exists before use
- Memoization: validation results are cached for performance
- Listing: list() returns all registered frames

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

### list

```ts
list: () => Promise<IFrameSchema[]>
```

Returns a list of all registered frame schemas
