---
title: docs/api-reference/class/RiskGlobalService
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

### checkSignal

```ts
checkSignal: (params: IRiskCheckArgs, context: { riskName: string; }) => Promise<boolean>
```

Checks if a signal should be allowed based on risk limits.

### addSignal

```ts
addSignal: (symbol: string, context: { strategyName: string; riskName: string; }) => void
```

Registers an opened signal with the risk management system.

### removeSignal

```ts
removeSignal: (symbol: string, context: { strategyName: string; riskName: string; }) => void
```

Removes a closed signal from the risk management system.
