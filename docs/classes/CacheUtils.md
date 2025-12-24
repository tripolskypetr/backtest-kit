---
title: docs/class/CacheUtils
group: docs
---

# CacheUtils

Utility class for function caching with timeframe-based invalidation.

Provides simplified API for wrapping functions with automatic caching.
Exported as singleton instance for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

### _getInstance

```ts
_getInstance: any
```

Memoized function to get or create CacheInstance for a function.
Each function gets its own isolated cache instance.

### fn

```ts
fn: <T extends Function>(run: T, context: { interval: CandleInterval; }) => T
```

Wrap a function with caching based on timeframe intervals.

Returns a wrapped version of the function that automatically caches results
and invalidates based on the specified candle interval.

### flush

```ts
flush: <T extends Function>(run?: T) => void
```

Flush (remove) cached CacheInstance for a specific function or all functions.

This method removes CacheInstance objects from the internal memoization cache.
When a CacheInstance is flushed, all cached results across all contexts
(all strategy/exchange/mode combinations) for that function are discarded.

Use cases:
- Remove specific function's CacheInstance when implementation changes
- Free memory by removing unused CacheInstances
- Reset all CacheInstances when switching between different test scenarios

Note: This is different from `clear()` which only removes cached values
for the current context within an existing CacheInstance.

### clear

```ts
clear: <T extends Function>(run: T) => void
```

Clear cached value for current execution context of a specific function.

Removes the cached entry for the current strategy/exchange/mode combination
from the specified function's CacheInstance. The next call to the wrapped function
will recompute the value for that context.

This only clears the cache for the current execution context, not all contexts.
Use `flush()` to remove the entire CacheInstance across all contexts.

Requires active execution context (strategy, exchange, backtest mode) and method context.
