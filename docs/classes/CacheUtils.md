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

### _getFnInstance

```ts
_getFnInstance: any
```

Memoized function to get or create CacheFnInstance for a function.
Each function gets its own isolated cache instance.

### _getFileInstance

```ts
_getFileInstance: any
```

Memoized function to get or create CacheFileInstance for an async function.
Each function gets its own isolated file-cache instance.

### fn

```ts
fn: <T extends Function, K = symbol>(run: T, context: { interval: CandleInterval; key?: (args: Parameters<T>) => K; }) => T & { clear(): void; gc(): number; }
```

Wrap a function with caching based on timeframe intervals.

Returns a wrapped version of the function that automatically caches results
and invalidates based on the specified candle interval.

### file

```ts
file: <T extends CacheFileFunction>(run: T, context: { interval: CandleInterval; name: string; key?: (args: [symbol: string, alignMs: number, ...rest: DropFirst<T>]) => string; }) => T & { ...; }
```

Wrap an async function with persistent file-based caching.

Returns a wrapped version of the function that reads from disk on cache hit
and writes the result to disk on cache miss. Files are stored under
`./dump/data/measure/{name}_{interval}_{index}/`.

The `run` function reference is used as the memoization key for the underlying
`CacheFileInstance`, so each unique function reference gets its own isolated instance.
Pass the same function reference each time to reuse the same cache.

### dispose

```ts
dispose: <T extends Function>(run: T) => void
```

Dispose (remove) the memoized CacheFnInstance for a specific function.

Removes the CacheFnInstance from the internal memoization cache, discarding all cached
results across all contexts (all strategy/exchange/mode combinations) for that function.
The next call to the wrapped function will create a fresh CacheFnInstance.

### clear

```ts
clear: () => void
```

Clears all memoized CacheFnInstance and CacheFileInstance objects.
Call this when process.cwd() changes between strategy iterations
so new instances are created with the updated base path.
