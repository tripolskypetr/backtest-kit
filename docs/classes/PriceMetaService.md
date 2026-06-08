---
title: docs/class/PriceMetaService
group: docs
---

# PriceMetaService

Service for tracking the latest market price per symbol-strategy-exchange-frame combination.

Maintains a memoized BehaviorSubject per unique key that is updated on every strategy tick
by StrategyConnectionService. Consumers can synchronously read the last known price or
await the first value if none has arrived yet.

Primary use case: providing the current price outside of a tick execution context,
e.g., when a command is triggered between ticks.

Features:
- One BehaviorSubject per (symbol, strategyName, exchangeName, frameName, backtest) key
- Falls back to ExchangeConnectionService.getAveragePrice when called inside an execution context
- Waits up to LISTEN_TIMEOUT ms for the first price if none is cached yet
- clear() disposes the BehaviorSubject for a single key or all keys

Architecture:
- Registered as singleton in DI container
- Updated by StrategyConnectionService after each tick
- Cleared by Backtest/Live/Walker at strategy start to prevent stale data

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### exchangeConnectionService

```ts
exchangeConnectionService: any
```

### getSource

```ts
getSource: any
```

Memoized factory for BehaviorSubject streams keyed by (symbol, strategyName, exchangeName, frameName, backtest).

Each subject holds the latest currentPrice emitted by the strategy iterator for that key.
Instances are cached until clear() is called.

### hasPrice

```ts
hasPrice: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest: boolean) => boolean
```

Checks if a price exists for the given key and has emitted at least one value.

### getCurrentPrice

```ts
getCurrentPrice: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest: boolean) => Promise<number>
```

Returns the current market price for the given symbol and context.

When called inside an execution context (i.e., during a signal handler or action),
delegates to ExchangeConnectionService.getAveragePrice for the live exchange price.
Otherwise, reads the last value from the cached BehaviorSubject. If no value has
been emitted yet, waits up to LISTEN_TIMEOUT ms for the first tick before throwing.

### next

```ts
next: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest: boolean) => Promise<void>
```

Pushes a new price value into the BehaviorSubject for the given key.

Called by StrategyConnectionService after each strategy tick to keep
the cached price up to date.

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => void
```

Disposes cached BehaviorSubject(s) to free memory and prevent stale data.

When called without arguments, clears all memoized price streams.
When called with a payload, clears only the stream for the specified key.
Should be called at strategy start (Backtest/Live/Walker) to reset state.
