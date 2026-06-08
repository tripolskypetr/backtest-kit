---
title: docs/class/WalkerCommandService
group: docs
---

# WalkerCommandService

Implements `TWalkerLogicPublicService`

Global service providing access to walker functionality.

Simple wrapper around WalkerLogicPublicService for dependency injection.
Used by public API exports.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### walkerLogicPublicService

```ts
walkerLogicPublicService: any
```

### walkerSchemaService

```ts
walkerSchemaService: any
```

### strategyValidationService

```ts
strategyValidationService: any
```

### exchangeValidationService

```ts
exchangeValidationService: any
```

### frameValidationService

```ts
frameValidationService: any
```

### walkerValidationService

```ts
walkerValidationService: any
```

### strategySchemaService

```ts
strategySchemaService: any
```

### riskValidationService

```ts
riskValidationService: any
```

### actionValidationService

```ts
actionValidationService: any
```

### validate

```ts
validate: any
```

Validates walker and associated strategy configurations.
Memoized to avoid redundant validations for the same walker-exchange-frame combination.

Strategy/risk/action validation is performed explicitly here in addition to the
cascade inside WalkerValidationService — this is critical-path code and the
redundant check is intentional defense-in-depth.

### run

```ts
run: (symbol: string, context: { walkerName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<WalkerContract, any, any>
```

Runs walker comparison for a symbol with context propagation.
