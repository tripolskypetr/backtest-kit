---
title: docs/class/WorkerUtils
group: docs
---

# WorkerUtils

Entry point that shards a registered worker schema across child
processes, one process per Worker.run call.

A worker binds a run mode (backtest, paper or live) to optional
strategy, exchange and frame references; the symbol list is NOT part of
the schema — Worker.run receives it per call and the WHOLE list runs in
ONE forked child. The same entry script serves both roles with NO
branching in user code: run calls arrive synchronously from the same
barrel import in both processes, so the Nth call in the parent matches
the Nth call in the child — the parent forks, the matching child call
starts its symbols inline, every other child call is a no-op.

## Constructor

```ts
constructor();
```

## Properties

### run

```ts
run: (symbolList: string[], params?: Partial<IWorkerRunParams>) => () => void
```

Runs the symbol list in its own forked worker process — or, inside
the matching worker child, starts those symbols in-process.

Fire-and-forget: the method returns synchronously and resolves the
worker (explicit name or the FIRST registered one) in the background.
The call ordinal is taken synchronously, so back-to-back barrel calls
keep their order. The magic is role detection, no branching needed in
user code:

- PARENT (no worker environment): for backtest mode appends the 1m
  candle cache download to the GLOBAL cache mutex (opt-in via
  GLOBAL_CONFIG.CC_WORKER_CANDLE_CACHE_DEFAULT or `cache` on the schema,
  off by default), then waits until
  EVERY queued download in the process has finished — no child
  starts against a partial cache — and forks ONE child for the
  whole list. The child
  gets the call ordinal via the environment (argv
  is passed through untouched) and its own working directory
  `./job/&lt;symbols joined with "-"&gt;` (created lazily). The child's
  stdout/stderr are piped into the root process; a non-zero exit is
  reported to exitEmitter. All work past the cache warm-up happens
  inside the worker.
- CHILD (forked by run): re-running the entry script replays the same
  run calls; the call whose ordinal matches the forked one starts its
  symbols inline via Backtest.background or Live.background (paper
  and live modes both run the live pipeline), every other call is a
  no-op. No candle caching here — the parent already drained it.
- MANUAL SHARD (docker-compose): set `BACKTEST_KIT_WORKER_INDEX` by
  hand — one container per run call, nothing is forked. The matching
  call runs its symbols inline exactly like a forked child, except it
  warms its OWN candle cache when caching is enabled (there is no
  parent to do it) and skips the orphan
  guard (there is no IPC channel). Each container has its own
  filesystem, so the `./job` isolation happens for free.
  The child kills itself when the parent dies: the IPC channel
  fork() opened closes and the "disconnect" handler exits the
  process, so no orphan keeps trading unsupervised.

The worker entry resolves automatically: with workerPath omitted the
process's OWN entry script (process.argv[1], symlinks unwrapped) is
forked. Pass workerPath to use a dedicated entry module instead.

Call it several times with different symbol arrays to shard a
portfolio across processes — every call forks its own child and
returns its own dispose; a symbol should appear in only one call.

Not available under the backtest-kit CLI: the method throws
synchronously when the CLI marker is set on globalThis — the CLI owns
the process tree and a forked entry would boot the CLI, not the
worker.

A resolution failure is routed to exitEmitter. The returned dispose
is safe to call at any moment: invoked while the launch is still
initializing, it marks the run as stopped and the child (or the
inline instances) are disposed right after they start; invoked later,
it stops them immediately.

### getWorkerSymbolList

```ts
getWorkerSymbolList: () => string[]
```

Returns the symbol list this worker process owns, or null in the
parent.

The environment carries only the call ordinal, so the list is
resolved from {@link RUN_SYMBOL_MAP } — populated synchronously by
every run call. Works uniformly for a forked child and a manual
docker-compose shard. Returns null in the parent (no owned index)
and before the matching run call has executed (the map has no entry
yet) — call it after the run calls, not before.

### getWorkerIndex

```ts
getWorkerIndex: () => number
```

Returns the ordinal of the Worker.run call this process owns, or
null in the parent.

Set automatically on a forked child, or BY HAND in a docker-compose
shard (`BACKTEST_KIT_WORKER_INDEX: "1"` in the service environment —
one container per run call). This is the matching key of the magic:
the process counts its own run calls and the call whose ordinal
equals this value runs its symbols inline. Also serves ordinal needs
outside run: staggered start delays, per-worker port or account
offsets.
