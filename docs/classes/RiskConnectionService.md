---
title: docs/class/RiskConnectionService
group: docs
---

# RiskConnectionService

Implements `TRisk$1`

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
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
```

### riskSchemaService

```ts
riskSchemaService: RiskSchemaService
```

### timeMetaService

```ts
timeMetaService: TimeMetaService
```

### actionCoreService

```ts
actionCoreService: ActionCoreService
```

Action core service injected from DI container.

### getRisk

```ts
getRisk: ((riskName: string, exchangeName: string, frameName: string, backtest: boolean) => ClientRisk) & IClearableMemoize<string> & IControlMemoize<string, ClientRisk>
```

Retrieves memoized ClientRisk instance for given risk name, exchange, frame and backtest mode.

Creates ClientRisk on first call, returns cached instance on subsequent calls.
Cache key includes exchangeName and frameName to isolate risk per exchange+frame.

### checkSignal

```ts
checkSignal: (params: IRiskCheckArgs, payload: { riskName: string; exchangeName: string; frameName: string; backtest: boolean; }, options?: Partial<IRiskCheckOptions>) => Promise<...>
```

Checks if a signal should be allowed based on risk limits.

Routes to appropriate ClientRisk instance based on provided context.
Validates portfolio drawdown, symbol exposure, position count, and daily loss limits.
ClientRisk will emit riskSubject event via onRejected callback when signal is rejected.

### checkSignalAndReserve

```ts
checkSignalAndReserve: (params: IRiskCheckArgs, payload: { riskName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<boolean>
```

Concurrency-safe variant of {@link checkSignal} — validates the signal AND
reserves a placeholder in the active position map atomically.

Routes to the same ClientRisk instance as {@link checkSignal} but delegates
to its `checkSignalAndReserve` method. Use from execution paths where the
caller will follow up with `addSignal` on success — guarantees concurrent
callers cannot all pass validation against a stale empty map. See
{@link IRisk.checkSignalAndReserve} for the full rationale.

### addSignal

```ts
addSignal: (symbol: string, payload: { strategyName: string; riskName: string; exchangeName: string; frameName: string; backtest: boolean; }, positionData: { position: "long" | "short"; priceOpen: number; priceStopLoss: number; priceTakeProfit: number; minuteEstimatedTime: number; openTimestamp: number; }) => Promise<...>
```

Registers an opened signal with the risk management system.
Routes to appropriate ClientRisk instance.

### removeSignal

```ts
removeSignal: (symbol: string, payload: { strategyName: string; riskName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Removes a closed signal from the risk management system.
Routes to appropriate ClientRisk instance.

### clear

```ts
clear: (payload?: { riskName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears the cached ClientRisk instance for the given risk name.
