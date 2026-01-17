---
title: docs/class/ClientAction
group: docs
---

# ClientAction

Implements `IAction`

ClientAction implementation for action handler execution.

Provides lifecycle management and event routing for action handlers:
- Initializes handler instance with strategy context
- Routes events to handler methods and callbacks
- Manages disposal and cleanup

Action handlers implement custom logic for:
- State management (Redux, Zustand, MobX)
- Event logging and monitoring
- Real-time notifications (Telegram, Discord, email)
- Analytics and metrics collection

Used internally by strategy execution to integrate action handlers.

## Constructor

```ts
constructor(params: IActionParams);
```

## Properties

### params

```ts
params: IActionParams
```

### _handlerInstance

```ts
_handlerInstance: Partial<IPublicAction>
```

Handler instance created from params.handler constructor.
Starts as null, gets initialized on first use.

### waitForInit

```ts
waitForInit: (() => Promise<void>) & ISingleshotClearable
```

Initializes handler instance using singleshot pattern.
Ensures initialization happens exactly once.

### dispose

```ts
dispose: (() => Promise<void>) & ISingleshotClearable
```

Cleans up resources and subscriptions when action handler is no longer needed.
Uses singleshot pattern to ensure cleanup happens exactly once.

## Methods

### signal

```ts
signal(event: IStrategyTickResult): Promise<void>;
```

Handles signal events from all modes (live + backtest).

### signalLive

```ts
signalLive(event: IStrategyTickResult): Promise<void>;
```

Handles signal events from live trading only.

### signalBacktest

```ts
signalBacktest(event: IStrategyTickResult): Promise<void>;
```

Handles signal events from backtest only.

### breakevenAvailable

```ts
breakevenAvailable(event: BreakevenContract): Promise<void>;
```

Handles breakeven events when stop-loss is moved to entry price.

### partialProfitAvailable

```ts
partialProfitAvailable(event: PartialProfitContract): Promise<void>;
```

Handles partial profit level events (10%, 20%, 30%, etc).

### partialLossAvailable

```ts
partialLossAvailable(event: PartialLossContract): Promise<void>;
```

Handles partial loss level events (-10%, -20%, -30%, etc).

### pingScheduled

```ts
pingScheduled(event: SchedulePingContract): Promise<void>;
```

Handles scheduled ping events during scheduled signal monitoring.

### pingActive

```ts
pingActive(event: ActivePingContract): Promise<void>;
```

Handles active ping events during active pending signal monitoring.

### riskRejection

```ts
riskRejection(event: RiskContract): Promise<void>;
```

Handles risk rejection events when signals fail risk validation.
