---
title: docs/class/PartialGlobalService
group: docs
---

# PartialGlobalService

Global service for partial profit/loss tracking.

Thin delegation layer that forwards operations to PartialConnectionService.
Provides centralized logging for all partial operations at the global level.

Architecture:
- Injected into ClientStrategy constructor via IStrategyParams
- Delegates all operations to PartialConnectionService
- Logs operations at "partialGlobalService" level before delegation

Purpose:
- Single injection point for ClientStrategy (dependency injection pattern)
- Centralized logging for monitoring partial operations
- Layer of abstraction between strategy and connection layer

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

Logger service injected from DI container.
Used for logging operations at global service level.

### partialConnectionService

```ts
partialConnectionService: any
```

Connection service injected from DI container.
Handles actual ClientPartial instance creation and management.

### strategyValidationService

```ts
strategyValidationService: any
```

Strategy validation service for validating strategy existence.

### strategySchemaService

```ts
strategySchemaService: any
```

Strategy schema service for retrieving strategy configuration.

### riskValidationService

```ts
riskValidationService: any
```

Risk validation service for validating risk existence.

### validate

```ts
validate: any
```

Validates strategy and associated risk configuration.
Memoized to avoid redundant validations for the same strategy-exchange-frame combination.

### profit

```ts
profit: (symbol: string, data: ISignalRow, currentPrice: number, revenuePercent: number, backtest: boolean, when: Date) => Promise<void>
```

Processes profit state and emits events for newly reached profit levels.

Logs operation at global service level, then delegates to PartialConnectionService.

### loss

```ts
loss: (symbol: string, data: ISignalRow, currentPrice: number, lossPercent: number, backtest: boolean, when: Date) => Promise<void>
```

Processes loss state and emits events for newly reached loss levels.

Logs operation at global service level, then delegates to PartialConnectionService.

### clear

```ts
clear: (symbol: string, data: ISignalRow, priceClose: number, backtest: boolean) => Promise<void>
```

Clears partial profit/loss state when signal closes.

Logs operation at global service level, then delegates to PartialConnectionService.
