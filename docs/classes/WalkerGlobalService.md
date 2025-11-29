---
title: docs/api-reference/class/WalkerGlobalService
group: docs
---

# WalkerGlobalService

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

### run

```ts
run: (symbol: string, context: { walkerName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<WalkerContract, any, any>
```

Runs walker comparison for a symbol with context propagation.
