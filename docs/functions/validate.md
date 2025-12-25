---
title: docs/function/validate
group: docs
---

# validate

```ts
declare function validate(args?: Partial<Args>): Promise<void>;
```

Validates the existence of all provided entity names across validation services.

This function accepts enum objects for various entity types (exchanges, frames,
strategies, risks, sizings, optimizers, walkers) and validates that each entity
name exists in its respective registry. Validation results are memoized for performance.

If no arguments are provided (or specific entity types are omitted), the function
automatically fetches and validates ALL registered entities from their respective
validation services. This is useful for comprehensive validation of the entire setup.

Use this before running backtests or optimizations to ensure all referenced
entities are properly registered and configured.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `args` | Partial validation arguments containing entity name enums to validate.
   If empty or omitted, validates all registered entities. |
