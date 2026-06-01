---
title: docs/class/CronUtils
group: docs
---

# CronUtils

Utility class for registering periodic tasks that fire on candle-interval
boundaries of the virtual time produced by parallel backtests.

Exported as singleton instance `Cron` for convenient usage.

Key property — **singleshot coordination across parallel backtests**:
when several `Backtest.background(symbol, ...)` runs hit the same aligned
boundary concurrently, the handler is invoked exactly once. Every parallel
`tick` for that boundary awaits the same in-flight promise and is released
together when the promise settles. After settlement the slot is cleared and
the next boundary produces a fresh promise.

Typical wiring:

## Constructor

```ts
constructor();
```

## Properties

### _entries

```ts
_entries: any
```

Registered entries by `name`.

Each record carries a monotonically increasing `generation` counter that
is bumped on every `register(entry)` call for the same name. The
generation participates in `firedKey` so writes from a still-in-flight
handler of a previous incarnation cannot poison `_firedOnce` for the
current incarnation — their key has a different generation suffix and
is simply ignored on lookup.

### _generationCounter

```ts
_generationCounter: any
```

Monotonic counter used to mint new entry generations on `register`.

### _inFlight

```ts
_inFlight: any
```

In-flight handler slots.

Slot key shape (always includes the generation suffix `:g${generation}`;
the `:${symbol}` scope is present only in fan-out mode):
- Periodic global: `${name}:${alignedMs}:g${generation}`.
- Periodic fan-out: `${name}:${alignedMs}:${symbol}:g${generation}`.
- Fire-once global: `${name}:once:g${generation}`.
- Fire-once fan-out: `${name}:once:${symbol}:g${generation}`.

Value is the shared in-flight handler promise. Every parallel `tick` for
the same slot key awaits this exact promise (mutex semantics) and is
released together when it settles. `_inFlight` is owned exclusively by
`_runEntry` — `clear()` does **not** touch it, so the singleshot promise
survives concurrent `clear` calls and continues to coordinate parallel
ticks until it settles.

### _firedOnce

```ts
_firedOnce: any
```

Keys of fire-once entries whose handler has already settled successfully.

Key shape (always includes the entry generation suffix `:g${generation}`):
- Global fire-once: `${name}:g${generation}`.
- Fan-out fire-once: `${name}:${symbol}:g${generation}` — one entry per
  whitelisted symbol.

The generation suffix isolates incarnations of the same `name`: writes
landing from a still-in-flight handler of a previous `register()` carry
the old generation and are never matched by the new entry's lookup.
Stale entries are pruned by `_clearFiredOnceFor` on `register`/`unregister`
and wiped by `clear()`.

Looked up by `_tick` to decide whether to skip; written by `_runEntry`
on successful settle.

### _clearFiredOnceFor

```ts
_clearFiredOnceFor: any
```

Garbage-collect every `_firedOnce` key that belongs to the entry `name`
(any generation, global or fan-out).

Called from `register`/`unregister` to free memory; **not** required
for correctness — the generation suffix already isolates re-registrations,
so leftover keys from old generations can never block a new entry.
They just sit unused until they are GC'd here or wiped by `clear()`.

### _runEntry

```ts
_runEntry: any
```

Build the singleshot promise for a single in-flight slot.

Invokes `entry.handler(symbol, aligned, backtest)`, swallows and logs
any error via `console.error`, and clears the `_inFlight` slot
in `.finally()` so the next boundary produces a fresh promise. For
fire-once entries `firedKey` is added to `_firedOnce` on success so
subsequent ticks skip it.

### register

```ts
register: (entry: CronEntry) => CronHandle
```

Register a periodic cron entry.

Idempotent on `name`: re-registering the same name replaces the previous
entry (interval/symbols/handler can all change). Re-registration does
**not** clear in-flight promises — entries still resolving complete with
the previous handler.

### unregister

```ts
unregister: (name: string) => void
```

Remove a registered entry by name.

Does not cancel handlers already in flight — those resolve on their own
and clear their slot via `.finally()`.

### clear

```ts
clear: (symbol?: string) => void
```

Clear fire-once marks so that fire-once entries can fire again.

Does **not** touch `_inFlight` — that map holds shared in-flight handler
promises through which parallel `tick`s coordinate. Wiping it mid-flight
would let a new `tick` start a second handler for a boundary that's
already running, breaking the singleshot contract.

Two modes:
- **Per-symbol** (`symbol` provided): clears only fan-out fire-once
  marks for that symbol — keys of the shape `${name}:${symbol}:g${gen}`.
  Global fire-once marks (`${name}:g${gen}`, no symbol component) are
  left intact, since they are not attributable to a single symbol.
  Useful for re-arming fan-out fire-once entries when a particular
  symbol's run finishes and you want a future re-run to fire again.
- **All** (no argument): wipes every fire-once mark across all entries
  and symbols. Registered entries are not removed — use `unregister`
  (or the disposer returned by `register`) for that.

**Race with in-flight handlers.** `_firedOnce` is written in
`_runEntry`'s `.finally()`, which can run *after* a concurrent
`clear()` call. In that case the fire-once mark reappears immediately
after being wiped, and the next tick will treat the entry as already
fired. This is consistent with the singleshot promise itself surviving
`clear()` — the handler is allowed to finish — and the entry's
generation suffix in `firedKey` guarantees the stale mark cannot
outlive a subsequent `register()` of the same name. If you need a hard
re-arm, `unregister` + `register` bumps the generation and makes any
late write a no-op.

### _tick

```ts
_tick: any
```

Process a virtual-time tick for `symbol` and fire any due cron entries.

**Private.** Invoked exclusively by the lifecycle bridge installed in
{@link enable} — `beforeStart` / `idlePing` / `activePing` / `schedulePing`
are funneled here through a shared `singlerun` queue, so calls to
`_tick` are serialised end-to-end. Do not call directly.

Algorithm (per registered entry):
0. Base-align the incoming `when` down to the 1-minute boundary (`ts`).
   Lifecycle subjects may emit with sub-second jitter; rounding here
   guarantees that `beforeStart` / `idlePing` / `activePing` /
   `schedulePing` for the same virtual minute all hash to the same
   slot key.
1. If `entry.symbols` is non-empty and does not include `symbol`, skip.
2. Decide scope from `entry.symbols`:
   - Empty/undefined → **global** (slot key has no symbol component).
   - Non-empty → **fan-out**, slot key carries `:${symbol}` so each
     whitelisted symbol gets its own slot and handler invocation.
3. Append the current entry generation suffix `:g${generation}` to both
   slot key and fired-once key. This isolates incarnations of the same
   `name`: a `register()` after an in-flight handler bumps the
   generation, so the late `_firedOnce` write from the old handler can
   never block the new entry.
4. **Fire-once** (`entry.interval === undefined`):
   - If the entry's fired-once key is already in `_firedOnce`, skip.
   - Slot key: `${name}:once` (+ scope) (+ gen).
   - `aligned` = the 1-minute-aligned `when` from step 0.
5. **Periodic** (`entry.interval` set):
   - Align `when` further to the entry's interval via {@link alignToInterval}.
   - If `ts !== alignedMs`, the tick is mid-interval — skip.
     (This is the "remainder === 0" boundary check from the spec;
     since `ts` is already on the 1-minute boundary, the check is exact
     for `1m` and consistent for higher intervals.)
   - Slot key: `${name}:${alignedMs}` (+ scope) (+ gen).
6. Singleshot per slot key: look up the slot in `_inFlight`. If a promise
   already exists, `await` the same promise. Otherwise invoke
   `entry.handler`, store the promise, and `await` it. The slot is
   removed in `.finally()` so the next boundary creates a fresh promise;
   for fire-once entries the fired-once key is also added to
   `_firedOnce` on success so subsequent ticks skip it.

Errors thrown by `handler` are caught, logged via `console.error`, and
**not** rethrown — a failing handler must not break the per-symbol
tick loop or unblock other parallel backtests with an unhandled
rejection. A failed fire-once handler is **not** marked as fired and
will retry on the next tick.

Requires active method context and execution context.

### enable

```ts
enable: (() => (...args: any[]) => any) & ISingleshotClearable<() => (...args: any[]) => any>
```

Subscribe `Cron` to the engine's strategy lifecycle subjects so registered
entries fire automatically — no manual wiring of `listenTickBacktest` /
`listenSchedulePing` etc. needed.

Subjects funneled into {@link _tick}:
- `beforeStartSubject` — first event of every run.
- `idlePingSubject` — every tick when no signal is pending or scheduled.
- `activePingSubject` — every tick while a pending signal is being monitored.
- `schedulePingSubject` — every tick while a scheduled signal is being monitored.

All four subjects are subscribed to a single `singlerun`-wrapped
handler that builds `_tick(event.symbol, new Date(event.timestamp),
event.backtest)`. `singlerun` merges the four streams into one serial
queue: at most one `_tick` runs at a time, the next waits. This matters
because the engine can emit `beforeStart` and an immediate `idlePing`
on the very same minute, and concurrent `_tick`s on the same
`(symbol, minute)` would otherwise race to open the same `_inFlight`
slot before either commit. Together these four sources cover every
tick the engine processes for every `(symbol, virtual-minute)` pair
regardless of whether the strategy is idle, active, or scheduled.

`enable` itself is wrapped in `singleshot`, so calling it repeatedly is
a no-op — subsequent calls return the same disposer. The disposer
unsubscribes from every subject and resets the singleshot so a future
`enable()` can re-subscribe cleanly. Equivalent to the
`RecentAdapter.enable` pattern.

The `.subscribe` callbacks are synchronous wrappers around the
`singlerun`-async handler; `_tick`'s returned promise is awaited inside
`singlerun` to enforce ordering but not bubbled back to the subject.
Errors are caught and logged inside `_runEntry`.

### disable

```ts
disable: () => void
```

Tear down the lifecycle subscriptions installed by {@link enable}.

Safe to call multiple times and safe to call before `enable()` — both
are no-ops. Does **not** unregister entries, does **not** touch
`_inFlight`, and does **not** wipe `_firedOnce` (use `unregister` or
`clear()` for those).

### dispose

```ts
dispose: () => void
```

Hard-reset the entire `Cron` state.

Performs in order:
1. {@link disable} — tears down lifecycle subscriptions and resets the
   `enable` singleshot so a future `enable()` re-subscribes cleanly.
2. Wipes `_entries` — every {@link register}'ed entry is forgotten.
   Disposers returned by previous `register()` calls become no-ops
   (their `unregister(name)` will not find anything to remove).
3. Wipes `_firedOnce` — all fire-once marks are dropped, so any future
   re-registration of the same `name` fires again on the next matching
   tick.
4. Does **not** touch `_inFlight` — in-flight handlers continue to
   settle in the background and clear their own slots via `.finally()`.
   Their final `_firedOnce.add(firedKey)` writes carry old-generation
   keys and are harmless (lookup uses the post-dispose generation).

Use from a CLI/session teardown when you want to throw away every
registration along with the lifecycle wiring — e.g. between two
independent runner scopes. For "just snap the subscriptions but keep
registrations" use {@link disable} instead; for "just re-arm fire-once
marks" use {@link clear}.

Idempotent. Safe to call multiple times and safe to call before
`enable()` / without any registrations.
