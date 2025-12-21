---
title: docs/class/RiskGlobalService
group: docs
---

# RiskGlobalService

Global service for risk operations.

Wraps RiskConnectionService for risk limit validation.
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

### riskConnectionService

```ts
riskConnectionService: any
```

### riskValidationService

```ts
riskValidationService: any
```

### validate

```ts
validate: any
```

Validates risk configuration.
Memoized to avoid redundant validations for the same risk instance.
Logs validation activity.

### checkSignal

```ts
checkSignal: (params: IRiskCheckArgs, context: { riskName: string; backtest: boolean; }) => Promise<boolean>
```

Checks if a signal should be allowed based on risk limits.

### addSignal

```ts
addSignal: (symbol: string, context: { strategyName: string; riskName: string; backtest: boolean; }) => Promise<void>
```

Registers an opened signal with the risk management system.

### removeSignal

```ts
removeSignal: (symbol: string, context: { strategyName: string; riskName: string; backtest: boolean; }) => Promise<void>
```

Removes a closed signal from the risk management system.

### clear

```ts
clear: (backtest: boolean, riskName?: string) => Promise<void>
```

Clears risk data.
If riskName is provided, clears data for that specific risk instance.
If no riskName is provided, clears all risk data.
