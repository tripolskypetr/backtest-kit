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
- breakeven() - Called when SL moved to entry
- partialProfit() - Called on profit milestones (10%, 20%, etc.)
- partialLoss() - Called on loss milestones (-10%, -20%, etc.)
- ping() - Called every minute during scheduled signal monitoring
- riskRejection() - Called when signal rejected by risk management

## Constructor

```ts
constructor(strategyName: string, frameName: string, actionName: string);
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

### breakeven

```ts
breakeven(event: BreakevenContract, source?: string): void | Promise<void>;
```

Handles breakeven events when stop-loss is moved to entry price.

Called once per signal when price moves far enough to cover fees and slippage.
Breakeven threshold: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2 + CC_BREAKEVEN_THRESHOLD

Triggered by: ActionCoreService.breakeven() via BreakevenConnectionService
Source: breakevenSubject.next() in CREATE_COMMIT_BREAKEVEN_FN callback
Frequency: Once per signal when threshold reached

Default implementation: Logs breakeven event.

### partialProfit

```ts
partialProfit(event: PartialProfitContract, source?: string): void | Promise<void>;
```

Handles partial profit level events (10%, 20%, 30%, etc).

Called once per profit level per signal (deduplicated).
Use to track profit milestones and adjust position management.

Triggered by: ActionCoreService.partialProfit() via PartialConnectionService
Source: partialProfitSubject.next() in CREATE_COMMIT_PROFIT_FN callback
Frequency: Once per profit level per signal

Default implementation: Logs partial profit event.

### partialLoss

```ts
partialLoss(event: PartialLossContract, source?: string): void | Promise<void>;
```

Handles partial loss level events (-10%, -20%, -30%, etc).

Called once per loss level per signal (deduplicated).
Use to track loss milestones and implement risk management actions.

Triggered by: ActionCoreService.partialLoss() via PartialConnectionService
Source: partialLossSubject.next() in CREATE_COMMIT_LOSS_FN callback
Frequency: Once per loss level per signal

Default implementation: Logs partial loss event.

### ping

```ts
ping(event: PingContract, source?: string): void | Promise<void>;
```

Handles ping events during scheduled signal monitoring.

Called every minute while a scheduled signal is waiting for activation.
Use to monitor pending signals and track wait time.

Triggered by: ActionCoreService.ping() via StrategyConnectionService
Source: pingSubject.next() in CREATE_COMMIT_PING_FN callback
Frequency: Every minute while scheduled signal is waiting

Default implementation: Logs ping event.

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
