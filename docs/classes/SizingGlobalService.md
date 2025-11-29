---
title: docs/api-reference/class/SizingGlobalService
group: docs
---

# SizingGlobalService

Global service for sizing operations.

Wraps SizingConnectionService for position size calculation.
Used internally by strategy execution and public API.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### sizingConnectionService

```ts
sizingConnectionService: any
```

### sizingValidationService

```ts
sizingValidationService: any
```

### calculate

```ts
calculate: (params: ISizingCalculateParams, context: { sizingName: string; }) => Promise<number>
```

Calculates position size based on risk parameters.
