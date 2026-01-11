---
title: docs/class/BreakevenGlobalService
group: docs
---

# BreakevenGlobalService

Implements `TBreakeven`

Global service for breakeven tracking.

Thin delegation layer that forwards operations to BreakevenConnectionService.
Provides centralized logging for all breakeven operations at the global level.

Architecture:
- Injected into ClientStrategy constructor via IStrategyParams
- Delegates all operations to BreakevenConnectionService
- Logs operations at "breakevenGlobalService" level before delegation

Purpose:
- Single injection point for ClientStrategy (dependency injection pattern)
- Centralized logging for monitoring breakeven operations
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

### breakevenConnectionService

```ts
breakevenConnectionService: any
```

Connection service injected from DI container.
Handles actual ClientBreakeven instance creation and management.

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

### exchangeValidationService

```ts
exchangeValidationService: any
```

Exchange validation service for validating exchange existence.

### frameValidationService

```ts
frameValidationService: any
```

Frame validation service for validating frame existence.

### validate

```ts
validate: any
```

Validates strategy and associated risk configuration.
Memoized to avoid redundant validations for the same strategy-exchange-frame combination.

### check

```ts
check: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean, when: Date) => Promise<boolean>
```

Checks if breakeven should be triggered and emits event if conditions met.

Logs operation at global service level, then delegates to BreakevenConnectionService.

### clear

```ts
clear: (symbol: string, data: IPublicSignalRow, priceClose: number, backtest: boolean) => Promise<void>
```

Clears breakeven state when signal closes.

Logs operation at global service level, then delegates to BreakevenConnectionService.
