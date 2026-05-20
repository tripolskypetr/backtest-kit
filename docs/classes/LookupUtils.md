---
title: docs/class/LookupUtils
group: docs
---

# LookupUtils

In-memory registry of currently running backtest and live activities.

Purpose:
- Each `Backtest.run` / `Live.run` / per-strategy walker iteration registers an
  {@link IActivityEntry} on start and removes it on completion.
- `Candle.spinLock` consults {@link isParallel} to decide whether the event-loop
  hand-off (post-candle-fetch spin) is worth performing. With a single active
  workload there is no peer to yield to, so the spin is skipped entirely.

Exposed as the `Lookup` singleton; no constructor parameters.

## Constructor

```ts
constructor();
```

## Properties

### _lookupMap

```ts
_lookupMap: any
```

Active entries keyed by their composite {@link Key }.

### addActivity

```ts
addActivity: (activity: IActivityEntry) => void
```

Registers a backtest or live activity in the lookup map.
Idempotent for identical keys — duplicate calls overwrite the existing entry.

### removeActivity

```ts
removeActivity: (activity: IActivityEntry) => void
```

Removes a previously registered activity from the lookup map.
Must be paired with a prior {@link addActivity}, typically in a `finally` block,
so a thrown error in the underlying run does not leave a stale entry behind.

### listActivity

```ts
listActivity: () => IActivityEntry[]
```

Returns a snapshot of currently active entries.
