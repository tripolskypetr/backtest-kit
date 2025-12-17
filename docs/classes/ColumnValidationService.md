---
title: docs/api-reference/class/ColumnValidationService
group: docs
---

# ColumnValidationService

Service for validating column configurations to ensure consistency with ColumnModel interface
and prevent invalid column definitions.

Performs comprehensive validation on all column definitions in COLUMN_CONFIG:
- **Required fields**: All columns must have key, label, format, and isVisible properties
- **Unique keys**: All key values must be unique within each column collection
- **Function validation**: format and isVisible must be callable functions
- **Data types**: key and label must be non-empty strings

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### validate

```ts
validate: () => void
```

Validates all column configurations in COLUMN_CONFIG for structural correctness.

Checks:
1. All required fields (key, label, format, isVisible) are present in each column
2. key and label are non-empty strings
3. format and isVisible are functions (not other types)
4. All keys are unique within each column collection
