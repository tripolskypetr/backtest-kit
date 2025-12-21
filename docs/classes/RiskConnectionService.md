---
title: docs/class/RiskConnectionService
group: docs
---

# RiskConnectionService

Connection service routing risk operations to correct ClientRisk instance.

Routes risk checking calls to the appropriate risk implementation
based on the provided riskName parameter. Uses memoization to cache
ClientRisk instances for performance.

Key features:
- Explicit risk routing via riskName parameter
- Memoized ClientRisk instances by riskName
- Risk limit validation for signals

Note: riskName is empty string for strategies without risk configuration.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### riskSchemaService

```ts
riskSchemaService: any
```

### getRisk

```ts
getRisk: ((riskName: string, backtest: boolean) => ClientRisk) & IClearableMemoize<string> & IControlMemoize<string, ClientRisk>
```

Retrieves memoized ClientRisk instance for given risk name and backtest mode.

Creates ClientRisk on first call, returns cached instance on subsequent calls.
Cache key is "riskName:backtest" string to separate live and backtest instances.

### checkSignal

```ts
checkSignal: (params: IRiskCheckArgs, context: { riskName: string; backtest: boolean; }) => Promise<boolean>
```

Checks if a signal should be allowed based on risk limits.

Routes to appropriate ClientRisk instance based on provided context.
Validates portfolio drawdown, symbol exposure, position count, and daily loss limits.
ClientRisk will emit riskSubject event via onRejected callback when signal is rejected.

### addSignal

```ts
addSignal: (symbol: string, context: { strategyName: string; riskName: string; backtest: boolean; }) => Promise<void>
```

Registers an opened signal with the risk management system.
Routes to appropriate ClientRisk instance.

### removeSignal

```ts
removeSignal: (symbol: string, context: { strategyName: string; riskName: string; backtest: boolean; }) => Promise<void>
```

Removes a closed signal from the risk management system.
Routes to appropriate ClientRisk instance.

### clear

```ts
clear: (backtest: boolean, riskName?: string) => Promise<void>
```

Clears the cached ClientRisk instance for the given risk name.
