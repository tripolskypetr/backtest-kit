---
title: docs/api-reference/class/SizingValidationService
group: docs
---

# SizingValidationService

Service for managing and validating position sizing configurations.

Maintains a registry of all configured sizing strategies and validates
their existence before operations. Uses memoization for performance.

Key features:
- Registry management: addSizing() to register new sizing strategies
- Validation: validate() ensures sizing strategy exists before use
- Memoization: validation results are cached for performance
- Listing: list() returns all registered sizing strategies

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### _sizingMap

```ts
_sizingMap: any
```

### addSizing

```ts
addSizing: (sizingName: string, sizingSchema: ISizingSchema) => void
```

Adds a sizing schema to the validation service

### validate

```ts
validate: (sizingName: string, source: string, method?: "fixed-percentage" | "kelly-criterion" | "atr-based") => void
```

Validates the existence of a sizing and optionally its method

### list

```ts
list: () => Promise<ISizingSchema[]>
```

Returns a list of all registered sizing schemas
