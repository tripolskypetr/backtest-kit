---
title: docs/class/ActionProxy
group: docs
---

# ActionProxy

Implements `IPublicAction`

Proxy wrapper for user-defined action handlers with automatic error capture.

Wraps all IPublicAction methods with trycatch to prevent user code errors from crashing the system.
All errors are logged, sent to errorEmitter, and returned as null (non-breaking).

Key features:
- Automatic error catching and logging for all action methods
- Safe execution of partial user implementations (missing methods return null)
- Consistent error capture across all action lifecycle events
- Non-breaking failure mode (errors logged but execution continues)

Architecture:
- Private constructor enforces factory pattern via fromInstance()
- Each method checks if target implements the method before calling
- Errors caught with fallback handler (warn log + errorEmitter)
- Returns null on error to prevent undefined behavior

Used by:
- ClientAction to wrap user-provided action handlers
- ActionCoreService to safely invoke action callbacks

## Constructor

```ts
constructor();
```

## Properties

### _target

```ts
_target: Partial<IPublicAction>
```

### params

```ts
params: IActionParams
```

## Methods

### init

```ts
init(): Promise<any>;
```

Initializes the action handler with error capture.

Wraps the user's init() method in trycatch to prevent initialization errors from crashing the system.
If the target doesn't implement init(), this method safely returns undefined.

### signal

```ts
signal(event: IStrategyTickResult): Promise<any>;
```

Handles signal events from all modes with error capture.

Wraps the user's signal() method to catch and log any errors.
Called on every tick/candle when strategy is evaluated.

### signalLive

```ts
signalLive(event: IStrategyTickResult): Promise<any>;
```

Handles signal events from live trading only with error capture.

Wraps the user's signalLive() method to catch and log any errors.
Called every tick in live mode.

### signalBacktest

```ts
signalBacktest(event: IStrategyTickResult): Promise<any>;
```

Handles signal events from backtest only with error capture.

Wraps the user's signalBacktest() method to catch and log any errors.
Called every candle in backtest mode.

### breakevenAvailable

```ts
breakevenAvailable(event: BreakevenContract): Promise<any>;
```

Handles breakeven events with error capture.

Wraps the user's breakevenAvailable() method to catch and log any errors.
Called once per signal when stop-loss is moved to entry price.

### partialProfitAvailable

```ts
partialProfitAvailable(event: PartialProfitContract): Promise<any>;
```

Handles partial profit level events with error capture.

Wraps the user's partialProfitAvailable() method to catch and log any errors.
Called once per profit level per signal (10%, 20%, 30%, etc).

### partialLossAvailable

```ts
partialLossAvailable(event: PartialLossContract): Promise<any>;
```

Handles partial loss level events with error capture.

Wraps the user's partialLossAvailable() method to catch and log any errors.
Called once per loss level per signal (-10%, -20%, -30%, etc).

### pingScheduled

```ts
pingScheduled(event: SchedulePingContract): Promise<any>;
```

Handles scheduled ping events with error capture.

Wraps the user's pingScheduled() method to catch and log any errors.
Called every minute while a scheduled signal is waiting for activation.

### pingActive

```ts
pingActive(event: ActivePingContract): Promise<any>;
```

Handles active ping events with error capture.

Wraps the user's pingActive() method to catch and log any errors.
Called every minute while a pending signal is active (position open).

### riskRejection

```ts
riskRejection(event: RiskContract): Promise<any>;
```

Handles risk rejection events with error capture.

Wraps the user's riskRejection() method to catch and log any errors.
Called only when signal is rejected by risk management validation.

### signalSync

```ts
signalSync(event: SignalSyncContract): Promise<void>;
```

Gate for position open/close via limit order.
NOT wrapped in trycatch — exceptions propagate to CREATE_SYNC_FN.

### dispose

```ts
dispose(): Promise<any>;
```

Cleans up resources with error capture.

Wraps the user's dispose() method to catch and log any errors.
Called once when strategy execution ends.

### fromInstance

```ts
static fromInstance(instance: Partial<IPublicAction>, params: IActionParams): ActionProxy;
```

Creates a new ActionProxy instance wrapping a user-provided action handler.

Factory method enforcing the private constructor pattern.
Wraps all methods of the provided instance with error capture.
