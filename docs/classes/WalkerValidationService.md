---
title: docs/api-reference/class/WalkerValidationService
group: docs
---

# WalkerValidationService

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### _walkerMap

```ts
_walkerMap: any
```

### addWalker

```ts
addWalker: (walkerName: string, walkerSchema: IWalkerSchema) => void
```

Adds a walker schema to the validation service

### validate

```ts
validate: (walkerName: string, source: string) => void
```

Validates the existence of a walker

### list

```ts
list: () => Promise<IWalkerSchema[]>
```

Returns a list of all registered walker schemas
