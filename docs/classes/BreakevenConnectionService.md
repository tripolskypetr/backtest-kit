---
title: docs/class/BreakevenConnectionService
group: docs
---

# BreakevenConnectionService

Implements `IBreakeven`

Connection service for breakeven tracking.

Provides memoized ClientBreakeven instances per signal ID.
Acts as factory and lifetime manager for ClientBreakeven objects.

Features:
- Creates one ClientBreakeven instance per signal ID (memoized)
- Configures instances with logger and event emitter callbacks
- Delegates check/clear operations to appropriate ClientBreakeven
- Cleans up memoized instances when signals are cleared

Architecture:
- Injected into ClientStrategy via BreakevenGlobalService
- Uses memoize from functools-kit for instance caching
- Emits events to breakevenSubject

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

### getBreakeven

```ts
getBreakeven: any
```

Memoized factory function for ClientBreakeven instances.

Creates one ClientBreakeven per signal ID and backtest mode with configured callbacks.
Instances are cached until clear() is called.

Key format: "signalId:backtest" or "signalId:live"
Value: ClientBreakeven instance with logger and event emitter

### check

```ts
check: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean, when: Date) => Promise<boolean>
```

Checks if breakeven should be triggered and emits event if conditions met.

Retrieves or creates ClientBreakeven for signal ID, initializes it if needed,
then delegates to ClientBreakeven.check() method.

### clear

```ts
clear: (symbol: string, data: ISignalRow, priceClose: number, backtest: boolean) => Promise<void>
```

Clears breakeven state when signal closes.

Retrieves ClientBreakeven for signal ID, initializes if needed,
delegates clear operation, then removes memoized instance.

Sequence:
1. Get ClientBreakeven from memoize cache
2. Ensure initialization (waitForInit)
3. Call ClientBreakeven.clear() - removes state, persists to disk
4. Clear memoized instance - prevents memory leaks
