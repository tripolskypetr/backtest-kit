---
title: docs/class/RiskGlobalService
group: docs
---

# RiskGlobalService

Implements `TRisk`

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

### exchangeValidationService

```ts
exchangeValidationService: any
```

### validate

```ts
validate: any
```

Validates risk configuration.
Memoized to avoid redundant validations for the same risk-exchange-frame combination.
Logs validation activity.

### checkSignal

```ts
checkSignal: (params: IRiskCheckArgs, payload: { riskName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<boolean>
```

Checks if a signal should be allowed based on risk limits.

### addSignal

```ts
addSignal: (symbol: string, payload: { strategyName: string; riskName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Registers an opened signal with the risk management system.

### removeSignal

```ts
removeSignal: (symbol: string, payload: { strategyName: string; riskName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Removes a closed signal from the risk management system.

### clear

```ts
clear: (payload?: { riskName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears risk data.
If payload is provided, clears data for that specific risk instance.
If no payload is provided, clears all risk data.
