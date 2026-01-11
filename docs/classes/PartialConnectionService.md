---
title: docs/class/PartialConnectionService
group: docs
---

# PartialConnectionService

Implements `IPartial`

Connection service for partial profit/loss tracking.

Provides memoized ClientPartial instances per signal ID.
Acts as factory and lifetime manager for ClientPartial objects.

Features:
- Creates one ClientPartial instance per signal ID (memoized)
- Configures instances with logger and event emitter callbacks
- Delegates profit/loss/clear operations to appropriate ClientPartial
- Cleans up memoized instances when signals are cleared

Architecture:
- Injected into ClientStrategy via PartialGlobalService
- Uses memoize from functools-kit for instance caching
- Emits events to partialProfitSubject/partialLossSubject

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

Logger service injected from DI container.

### getPartial

```ts
getPartial: any
```

Memoized factory function for ClientPartial instances.

Creates one ClientPartial per signal ID and backtest mode with configured callbacks.
Instances are cached until clear() is called.

Key format: "signalId:backtest" or "signalId:live"
Value: ClientPartial instance with logger and event emitters

### profit

```ts
profit: (symbol: string, data: IPublicSignalRow, currentPrice: number, revenuePercent: number, backtest: boolean, when: Date) => Promise<void>
```

Processes profit state and emits events for newly reached profit levels.

Retrieves or creates ClientPartial for signal ID, initializes it if needed,
then delegates to ClientPartial.profit() method.

### loss

```ts
loss: (symbol: string, data: IPublicSignalRow, currentPrice: number, lossPercent: number, backtest: boolean, when: Date) => Promise<void>
```

Processes loss state and emits events for newly reached loss levels.

Retrieves or creates ClientPartial for signal ID, initializes it if needed,
then delegates to ClientPartial.loss() method.

### clear

```ts
clear: (symbol: string, data: IPublicSignalRow, priceClose: number, backtest: boolean) => Promise<void>
```

Clears partial profit/loss state when signal closes.

Retrieves ClientPartial for signal ID, initializes if needed,
delegates clear operation, then removes memoized instance.

Sequence:
1. Get ClientPartial from memoize cache
2. Ensure initialization (waitForInit)
3. Call ClientPartial.clear() - removes state, persists to disk
4. Clear memoized instance - prevents memory leaks
