---
title: docs/interface/IAction
group: docs
---

# IAction

Action interface for state manager integration.

Provides methods to handle all events emitted by connection services.
Each method corresponds to a specific event type emitted via .next() calls.

Use this interface to implement custom state management logic:
- Redux/Zustand action dispatchers
- Event logging systems
- Real-time monitoring dashboards
- Analytics and metrics collection

## Methods

### signal

```ts
signal: (event: IStrategyTickResult) => void | Promise<void>
```

Handles signal events from all modes (live + backtest).

Emitted by: StrategyConnectionService via signalEmitter
Source: StrategyConnectionService.tick() and StrategyConnectionService.backtest()
Frequency: Every tick/candle when strategy is evaluated

### signalLive

```ts
signalLive: (event: IStrategyTickResult) => void | Promise<void>
```

Handles signal events from live trading only.

Emitted by: StrategyConnectionService via signalLiveEmitter
Source: StrategyConnectionService.tick() when backtest=false
Frequency: Every tick in live mode

### signalBacktest

```ts
signalBacktest: (event: IStrategyTickResult) => void | Promise<void>
```

Handles signal events from backtest only.

Emitted by: StrategyConnectionService via signalBacktestEmitter
Source: StrategyConnectionService.backtest() when backtest=true
Frequency: Every candle in backtest mode

### breakevenAvailable

```ts
breakevenAvailable: (event: BreakevenContract) => void | Promise<void>
```

Handles breakeven events when stop-loss is moved to entry price.

Emitted by: BreakevenConnectionService via breakevenSubject
Source: COMMIT_BREAKEVEN_FN callback in BreakevenConnectionService
Frequency: Once per signal when breakeven threshold is reached

### partialProfitAvailable

```ts
partialProfitAvailable: (event: PartialProfitContract) => void | Promise<void>
```

Handles partial profit level events (10%, 20%, 30%, etc).

Emitted by: PartialConnectionService via partialProfitSubject
Source: COMMIT_PROFIT_FN callback in PartialConnectionService
Frequency: Once per profit level per signal (deduplicated)

### partialLossAvailable

```ts
partialLossAvailable: (event: PartialLossContract) => void | Promise<void>
```

Handles partial loss level events (-10%, -20%, -30%, etc).

Emitted by: PartialConnectionService via partialLossSubject
Source: COMMIT_LOSS_FN callback in PartialConnectionService
Frequency: Once per loss level per signal (deduplicated)

### pingScheduled

```ts
pingScheduled: (event: SchedulePingContract) => void | Promise<void>
```

Handles scheduled ping events during scheduled signal monitoring.

Emitted by: StrategyConnectionService via schedulePingSubject
Source: CREATE_COMMIT_SCHEDULE_PING_FN callback in StrategyConnectionService
Frequency: Every minute while scheduled signal is waiting for activation

### pingActive

```ts
pingActive: (event: ActivePingContract) => void | Promise<void>
```

Handles active ping events during active pending signal monitoring.

Emitted by: StrategyConnectionService via activePingSubject
Source: CREATE_COMMIT_ACTIVE_PING_FN callback in StrategyConnectionService
Frequency: Every minute while pending signal is active

### riskRejection

```ts
riskRejection: (event: RiskContract) => void | Promise<void>
```

Handles risk rejection events when signals fail risk validation.

Emitted by: RiskConnectionService via riskSubject
Source: COMMIT_REJECTION_FN callback in RiskConnectionService
Frequency: Only when signal is rejected (not emitted for allowed signals)

### dispose

```ts
dispose: () => void | Promise<void>
```

Cleans up resources and subscriptions when action handler is no longer needed.

Called by: Connection services during shutdown
Use for: Unsubscribing from observables, closing connections, flushing buffers
