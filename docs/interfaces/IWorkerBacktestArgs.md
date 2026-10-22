---
title: docs/interface/IWorkerBacktestArgs
group: docs
---

# IWorkerBacktestArgs

Worker running every symbol through the backtest pipeline
(Backtest.background) over a historical frame window — all symbols of
one Worker.run call share a single child process.

## Properties

### backtest

```ts
backtest: true
```

Discriminator for type-safe union: run the backtest pipeline

### frameName

```ts
frameName: string
```

Timeframe bounding the run. Optional: defaults to the single registered frame; ambiguous (2+ registered) requires it

### cache

```ts
cache: boolean
```

Warm the 1m candle cache over the frame window in the PARENT before forking (a manual docker-compose shard warms its own instead); downloads of all Worker.run calls are serialized by a global mutex and no child starts until every queued download completes. Default: GLOBAL_CONFIG.CC_WORKER_CANDLE_CACHE_DEFAULT (false — the cache directory is cwd-relative and children run in their own ./job directories, so enable only when candles are read from a cwd-independent source)
