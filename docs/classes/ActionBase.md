---
title: docs/class/ActionBase
group: docs
---

# ActionBase

Implements `IPublicAction`

Base class for custom action handlers.

Provides default implementations for all IPublicAction methods that log events.
Extend this class to implement custom action handlers for:
- State management (Redux, Zustand, MobX)
- Real-time notifications (Telegram, Discord, Email)
- Event logging and monitoring
- Analytics and metrics collection
- Custom business logic triggers

Key features:
- All methods have default implementations (no need to implement unused methods)
- Automatic logging of all events via backtest.loggerService
- Access to strategy context (strategyName, frameName, actionName)
- Implements full IPublicAction interface

Lifecycle:
1. Constructor called with (strategyName, frameName, actionName)
2. init() called once for async initialization
3. Event methods called as strategy executes (signal, breakeven, partialProfit, etc.)
4. dispose() called once for cleanup

Event flow:
- signal() - Called on every tick/candle (all modes)
- signalLive() - Called only in live mode
- signalBacktest() - Called only in backtest mode
- breakevenAvailable() - Called when SL moved to entry
- partialProfitAvailable() - Called on profit milestones (10%, 20%, etc.)
- partialLossAvailable() - Called on loss milestones (-10%, -20%, etc.)
- pingScheduled() - Called every minute during scheduled signal monitoring
- pingActive() - Called every minute during active pending signal monitoring
- riskRejection() - Called when signal rejected by risk management

## Constructor

```ts
constructor(strategyName: string, frameName: string, actionName: string, backtest: boolean);
```

## Properties

### strategyName

```ts
strategyName: string
```

### frameName

```ts
frameName: string
```

### actionName

```ts
actionName: string
```

### backtest

```ts
backtest: boolean
```

## Methods

### init

```ts
init(source?: string): void | Promise<void>;
```

Initializes the action handler.

Called once after construction. Override to perform async initialization:
- Establish database connections
- Initialize API clients
- Load configuration files
- Open file handles or network sockets

Default implementation: Logs initialization event.

### signal

```ts
signal(event: IStrategyTickResult, source?: string): void | Promise<void>;
```

Handles signal events from all modes (live + backtest).

Called every tick/candle when strategy is evaluated.
Receives all signal states: idle, scheduled, opened, active, closed, cancelled.

Triggered by: ActionCoreService.signal() via StrategyConnectionService
Source: signalEmitter.next() in tick() and backtest() methods
Frequency: Every tick/candle

Default implementation: Logs signal event.

### signalLive

```ts
signalLive(event: IStrategyTickResult, source?: string): void | Promise<void>;
```

Handles signal events from live trading only.

Called every tick in live mode.
Use for actions that should only run in production (e.g., sending real notifications).

Triggered by: ActionCoreService.signalLive() via StrategyConnectionService
Source: signalLiveEmitter.next() in tick() and backtest() methods when backtest=false
Frequency: Every tick in live mode

Default implementation: Logs live signal event.

### signalBacktest

```ts
signalBacktest(event: IStrategyTickResult, source?: string): void | Promise<void>;
```

Handles signal events from backtest only.

Called every candle in backtest mode.
Use for actions specific to backtesting (e.g., collecting test metrics).

Triggered by: ActionCoreService.signalBacktest() via StrategyConnectionService
Source: signalBacktestEmitter.next() in tick() and backtest() methods when backtest=true
Frequency: Every candle in backtest mode

Default implementation: Logs backtest signal event.

### breakevenAvailable

```ts
breakevenAvailable(event: BreakevenContract, source?: string): void | Promise<void>;
```

Handles breakeven events when stop-loss is moved to entry price.

Called once per signal when price moves far enough to cover fees and slippage.
Breakeven threshold: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2 + CC_BREAKEVEN_THRESHOLD

Triggered by: ActionCoreService.breakevenAvailable() via BreakevenConnectionService
Source: breakevenSubject.next() in CREATE_COMMIT_BREAKEVEN_FN callback
Frequency: Once per signal when threshold reached

Default implementation: Logs breakeven event.

### partialProfitAvailable

```ts
partialProfitAvailable(event: PartialProfitContract, source?: string): void | Promise<void>;
```

Handles partial profit level events (10%, 20%, 30%, etc).

Called once per profit level per signal (deduplicated).
Use to track profit milestones and adjust position management.

Triggered by: ActionCoreService.partialProfitAvailable() via PartialConnectionService
Source: partialProfitSubject.next() in CREATE_COMMIT_PROFIT_FN callback
Frequency: Once per profit level per signal

Default implementation: Logs partial profit event.

### partialLossAvailable

```ts
partialLossAvailable(event: PartialLossContract, source?: string): void | Promise<void>;
```

Handles partial loss level events (-10%, -20%, -30%, etc).

Called once per loss level per signal (deduplicated).
Use to track loss milestones and implement risk management actions.

Triggered by: ActionCoreService.partialLossAvailable() via PartialConnectionService
Source: partialLossSubject.next() in CREATE_COMMIT_LOSS_FN callback
Frequency: Once per loss level per signal

Default implementation: Logs partial loss event.

### pingScheduled

```ts
pingScheduled(event: SchedulePingContract, source?: string): void | Promise<void>;
```

Handles scheduled ping events during scheduled signal monitoring.

Called every minute while a scheduled signal is waiting for activation.
Use to monitor pending signals and track wait time.

Triggered by: ActionCoreService.pingScheduled() via StrategyConnectionService
Source: schedulePingSubject.next() in CREATE_COMMIT_SCHEDULE_PING_FN callback
Frequency: Every minute while scheduled signal is waiting

Default implementation: Logs scheduled ping event.

### pingActive

```ts
pingActive(event: ActivePingContract, source?: string): void | Promise<void>;
```

Handles active ping events during active pending signal monitoring.

Called every minute while a pending signal is active (position open).
Use to monitor active positions and track lifecycle.

Triggered by: ActionCoreService.pingActive() via StrategyConnectionService
Source: activePingSubject.next() in CREATE_COMMIT_ACTIVE_PING_FN callback
Frequency: Every minute while pending signal is active

Default implementation: Logs active ping event.

### riskRejection

```ts
riskRejection(event: RiskContract, source?: string): void | Promise<void>;
```

Handles risk rejection events when signals fail risk validation.

Called only when signal is rejected (not emitted for allowed signals).
Use to track rejected signals and analyze risk management effectiveness.

Triggered by: ActionCoreService.riskRejection() via RiskConnectionService
Source: riskSubject.next() in CREATE_COMMIT_REJECTION_FN callback
Frequency: Only when signal fails risk validation

Default implementation: Logs risk rejection event.

### dispose

```ts
dispose(source?: string): void | Promise<void>;
```

Cleans up resources and subscriptions when action handler is disposed.

Called once when strategy execution ends.
Guaranteed to run exactly once via singleshot pattern.

Override to:
- Close database connections
- Disconnect from external services
- Flush buffers
- Save state to disk
- Unsubscribe from observables

Default implementation: Logs dispose event.
