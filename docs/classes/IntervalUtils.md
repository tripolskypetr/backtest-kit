---
title: docs/class/IntervalUtils
group: docs
---

# IntervalUtils

Utility class for wrapping signal functions with once-per-interval firing.
Provides two modes: in-memory (`fn`) and persistent file-based (`file`).
Exported as singleton instance `Interval` for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

### _getInstance

```ts
_getInstance: any
```

Memoized factory to get or create an `IntervalFnInstance` for a function.
Each function reference gets its own isolated instance.

### _getFileInstance

```ts
_getFileInstance: any
```

Memoized factory to get or create an `IntervalFileInstance` for an async function.
Each function reference gets its own isolated persistent instance.

### fn

```ts
fn: (run: TIntervalFn, context: { interval: CandleInterval; }) => TIntervalFn & { clear(): void; }
```

Wrap a signal function with in-memory once-per-interval firing.

Returns a wrapped version of the function that fires at most once per interval boundary.
If the function returns `null`, the countdown does not start and the next call retries.

The `run` function reference is used as the memoization key for the underlying
`IntervalFnInstance`, so each unique function reference gets its own isolated instance.

### file

```ts
file: <T extends TIntervalFileFn>(run: T, context: { interval: CandleInterval; name: string; }) => T & { clear(): Promise<void>; }
```

Wrap an async signal function with persistent file-based once-per-interval firing.

Returns a wrapped version of the function that reads from disk on hit (returns `null`)
and writes the fired signal to disk on the first successful fire.
Fired state survives process restarts.

The `run` function reference is used as the memoization key for the underlying
`IntervalFileInstance`, so each unique function reference gets its own isolated instance.

### dispose

```ts
dispose: (run: TIntervalFn) => void
```

Dispose (remove) the memoized `IntervalFnInstance` for a specific function.

Removes the instance from the internal memoization cache, discarding all in-memory
fired-interval state across all contexts for that function.
The next call to the wrapped function will create a fresh `IntervalFnInstance`.

### clear

```ts
clear: () => void
```

Clears all memoized `IntervalFnInstance` and `IntervalFileInstance` objects and
resets the `IntervalFileInstance` index counter.
Call this when `process.cwd()` changes between strategy iterations
so new instances are created with the updated base path.
