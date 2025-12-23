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
fn: <T extends Function>(run: T, interval: CandleInterval) => Function
```

Wrap a function with caching based on timeframe intervals.

Returns a wrapped version of the function that automatically caches results
and invalidates based on the specified candle interval.
