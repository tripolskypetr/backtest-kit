---
title: docs/class/ActionCoreService
group: docs
---

# ActionCoreService

Implements `TAction$1`

Global service for action operations.

Manages action dispatching for strategies by automatically resolving
action lists from strategy schemas and invoking handlers for each registered action.

Key responsibilities:
- Retrieves action list from strategy schema (IStrategySchema.actions)
- Validates strategy context (strategyName, exchangeName, frameName)
- Validates all associated actions, risks from strategy schema
- Dispatches events to all registered actions in sequence

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

### actionConnectionService

```ts
actionConnectionService: any
```

### actionValidationService

```ts
actionValidationService: any
```

### exchangeValidationService

```ts
exchangeValidationService: any
```

### frameValidationService

```ts
frameValidationService: any
```

### strategyValidationService

```ts
strategyValidationService: any
```

### strategySchemaService

```ts
strategySchemaService: any
```

### riskValidationService

```ts
riskValidationService: any
```

### validate

```ts
validate: any
```

Validates strategy context and all associated configurations.

Memoized to avoid redundant validations for the same strategy-exchange-frame combination.
Retrieves strategy schema and validates:
- Strategy name existence
- Exchange name validity
- Frame name validity (if provided)
- Risk profile(s) validity (if configured in strategy schema)
- Action name(s) validity (if configured in strategy schema)

### initFn

```ts
initFn: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Initializes all ClientAction instances for the strategy.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the init handler on each ClientAction instance sequentially.
Calls waitForInit() on each action to load persisted state.

### signal

```ts
signal: (backtest: boolean, event: IStrategyTickResult, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes signal event to all registered actions for the strategy.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the signal handler on each ClientAction instance sequentially.

### signalLive

```ts
signalLive: (backtest: boolean, event: IStrategyTickResult, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes signal event from live trading to all registered actions.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the signalLive handler on each ClientAction instance sequentially.

### signalBacktest

```ts
signalBacktest: (backtest: boolean, event: IStrategyTickResult, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes signal event from backtest to all registered actions.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the signalBacktest handler on each ClientAction instance sequentially.

### breakevenAvailable

```ts
breakevenAvailable: (backtest: boolean, event: BreakevenContract, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes breakeven event to all registered actions for the strategy.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the breakevenAvailable handler on each ClientAction instance sequentially.

### partialProfitAvailable

```ts
partialProfitAvailable: (backtest: boolean, event: PartialProfitContract, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes partial profit event to all registered actions for the strategy.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the partialProfitAvailable handler on each ClientAction instance sequentially.

### partialLossAvailable

```ts
partialLossAvailable: (backtest: boolean, event: PartialLossContract, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes partial loss event to all registered actions for the strategy.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the partialLossAvailable handler on each ClientAction instance sequentially.

### pingScheduled

```ts
pingScheduled: (backtest: boolean, event: SchedulePingContract, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes scheduled ping event to all registered actions for the strategy.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the pingScheduled handler on each ClientAction instance sequentially.
Called every minute during scheduled signal monitoring.

### pingActive

```ts
pingActive: (backtest: boolean, event: ActivePingContract, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes active ping event to all registered actions for the strategy.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the pingActive handler on each ClientAction instance sequentially.
Called every minute during active pending signal monitoring.

### riskRejection

```ts
riskRejection: (backtest: boolean, event: RiskContract, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Routes risk rejection event to all registered actions for the strategy.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the riskRejection handler on each ClientAction instance sequentially.
Called only when a signal fails risk validation.

### dispose

```ts
dispose: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Disposes all ClientAction instances for the strategy.

Retrieves action list from strategy schema (IStrategySchema.actions)
and invokes the dispose handler on each ClientAction instance sequentially.
Called when strategy execution ends to clean up resources.

### clear

```ts
clear: (payload?: { actionName: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears action data.

If payload is provided, validates and clears data for the specific action instance.
If no payload is provided, clears all action data across all strategies.
