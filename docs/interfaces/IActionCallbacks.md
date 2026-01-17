---
title: docs/interface/IActionCallbacks
group: docs
---

# IActionCallbacks

Lifecycle and event callbacks for action handlers.

Provides hooks for initialization, disposal, and event handling.
All callbacks are optional and support both sync and async execution.

Use cases:
- Resource initialization (database connections, file handles)
- Resource cleanup (close connections, flush buffers)
- Event logging and monitoring
- State persistence

## Methods

### onInit

```ts
onInit: (actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when action handler is initialized.

Use for:
- Opening database connections
- Initializing external services
- Loading persisted state
- Setting up subscriptions

### onDispose

```ts
onDispose: (actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when action handler is disposed.

Use for:
- Closing database connections
- Flushing buffers
- Saving state to disk
- Unsubscribing from observables

### onSignal

```ts
onSignal: (event: IStrategyTickResult, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called on signal events from all modes (live + backtest).

Triggered by: StrategyConnectionService via signalEmitter
Frequency: Every tick/candle when strategy is evaluated

### onSignalLive

```ts
onSignalLive: (event: IStrategyTickResult, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called on signal events from live trading only.

Triggered by: StrategyConnectionService via signalLiveEmitter
Frequency: Every tick in live mode

### onSignalBacktest

```ts
onSignalBacktest: (event: IStrategyTickResult, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called on signal events from backtest only.

Triggered by: StrategyConnectionService via signalBacktestEmitter
Frequency: Every candle in backtest mode

### onBreakevenAvailable

```ts
onBreakevenAvailable: (event: BreakevenContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when breakeven is triggered (stop-loss moved to entry price).

Triggered by: BreakevenConnectionService via breakevenSubject
Frequency: Once per signal when breakeven threshold is reached

### onPartialProfitAvailable

```ts
onPartialProfitAvailable: (event: PartialProfitContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when partial profit level is reached (10%, 20%, 30%, etc).

Triggered by: PartialConnectionService via partialProfitSubject
Frequency: Once per profit level per signal (deduplicated)

### onPartialLossAvailable

```ts
onPartialLossAvailable: (event: PartialLossContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when partial loss level is reached (-10%, -20%, -30%, etc).

Triggered by: PartialConnectionService via partialLossSubject
Frequency: Once per loss level per signal (deduplicated)

### onPingScheduled

```ts
onPingScheduled: (event: SchedulePingContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called during scheduled signal monitoring (every minute while waiting for activation).

Triggered by: StrategyConnectionService via schedulePingSubject
Frequency: Every minute while scheduled signal is waiting

### onPingActive

```ts
onPingActive: (event: ActivePingContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called during active pending signal monitoring (every minute while position is active).

Triggered by: StrategyConnectionService via activePingSubject
Frequency: Every minute while pending signal is active

### onRiskRejection

```ts
onRiskRejection: (event: RiskContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when signal is rejected by risk management.

Triggered by: RiskConnectionService via riskSubject
Frequency: Only when signal fails risk validation (not emitted for allowed signals)
