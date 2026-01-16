---
title: docs/class/ActionConnectionService
group: docs
---

# ActionConnectionService

Implements `TAction`

Connection service routing action operations to correct ClientAction instance.

Routes action calls to the appropriate action implementation
based on the provided actionName parameter. Uses memoization to cache
ClientAction instances for performance.

Key features:
- Explicit action routing via actionName parameter
- Memoized ClientAction instances by actionName, strategyName, frameName
- Event routing to action handlers

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### actionSchemaService

```ts
actionSchemaService: any
```

### getAction

```ts
getAction: ((actionName: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => ClientAction) & IClearableMemoize<string> & IControlMemoize<...>
```

Retrieves memoized ClientAction instance for given action name, strategy, exchange, frame and backtest mode.

Creates ClientAction on first call, returns cached instance on subsequent calls.
Cache key includes strategyName, exchangeName and frameName to isolate action per strategy-frame pair.

### initFn

```ts
initFn: (backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Initializes the ClientAction instance for the given action name.

Calls waitForInit() on the action instance to load persisted state.

### signal

```ts
signal: (event: IStrategyTickResult, backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes signal event to appropriate ClientAction instance.

### signalLive

```ts
signalLive: (event: IStrategyTickResult, backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes signalLive event to appropriate ClientAction instance.

### signalBacktest

```ts
signalBacktest: (event: IStrategyTickResult, backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes signalBacktest event to appropriate ClientAction instance.

### breakeven

```ts
breakeven: (event: BreakevenContract, backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes breakeven event to appropriate ClientAction instance.

### partialProfit

```ts
partialProfit: (event: PartialProfitContract, backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes partialProfit event to appropriate ClientAction instance.

### partialLoss

```ts
partialLoss: (event: PartialLossContract, backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes partialLoss event to appropriate ClientAction instance.

### ping

```ts
ping: (event: PingContract, backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes ping event to appropriate ClientAction instance.

### riskRejection

```ts
riskRejection: (event: RiskContract, backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes riskRejection event to appropriate ClientAction instance.

### dispose

```ts
dispose: (backtest: boolean, context: { actionName: string; strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Disposes the ClientAction instance for the given action name.

### clear

```ts
clear: (payload?: { actionName: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears the cached ClientAction instance for the given action name.
