---
title: docs/class/LauncherUtils
group: docs
---

# LauncherUtils

Entry point that turns a registered launcher schema into running
backtest or live instances.

A launcher binds a run mode (backtest, paper or live) to a symbol list
and optional strategy, exchange and frame references; everything left
out of the schema is resolved implicitly from the registries — a setup
with one strategy, one exchange and one frame needs nothing but the
symbol list and the mode flag.

## Constructor

```ts
constructor();
```

## Properties

### run

```ts
run: ((launcherName?: string) => () => void) & ISingleshotClearable<(launcherName?: string) => () => void>
```

Runs a registered launcher in the background and returns a dispose
function that stops every instance the launch started.

Fire-and-forget: the method returns synchronously while {@link RUN_FN }
resolves the launcher (explicit name or the FIRST registered one), its
strategy, exchange and — for backtest mode — frame, warms the candle
cache (skip it with `cache: false` on the schema) and launches every
symbol of the schema's symbolList via Backtest.background or
Live.background (paper and live modes both run the live pipeline).
A resolution failure is routed to exitEmitter — the same fatal-error
channel the background launches themselves report through — so it
surfaces via listenExit instead of an unhandled rejection.

The returned dispose is safe to call at any moment: invoked while the
launch is still initializing, it marks the run as stopped and the
instances are disposed right after they start; invoked later, it stops
them immediately.

The optional onWaitForInit callback fires before run blocks on
waitForReady — the place to kick off lazy schema registration.

### listen

```ts
listen: (fn: Function) => () => void
```

Subscribes a listener function to be notified when the launcher is scheduled for run.

Support asynchronous callback or a Promise-returning function. The listener is called
once when the launcher is ready to run, allowing for lazy schema registration or other
promise-based initialization tasks before the actual run.
