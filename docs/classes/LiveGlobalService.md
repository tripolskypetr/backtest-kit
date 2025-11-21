---
title: docs/api-reference/class/LiveGlobalService
group: docs
---

# LiveGlobalService

Global service providing access to live trading functionality.

Simple wrapper around LiveLogicPublicService for dependency injection.
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

### liveLogicPublicService

```ts
liveLogicPublicService: any
```

### strategyValidationService

```ts
strategyValidationService: any
```

### exchangeValidationService

```ts
exchangeValidationService: any
```

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>
```

Runs live trading for a symbol with context propagation.

Infinite async generator with crash recovery support.
