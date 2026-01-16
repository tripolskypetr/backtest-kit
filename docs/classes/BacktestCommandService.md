---
title: docs/class/BacktestCommandService
group: docs
---

# BacktestCommandService

Implements `TBacktestLogicPublicService`

Global service providing access to backtest functionality.

Simple wrapper around BacktestLogicPublicService for dependency injection.
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

### backtestLogicPublicService

```ts
backtestLogicPublicService: any
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

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<IStrategyBacktestResult, void, unknown>
```

Runs backtest for a symbol with context propagation.
