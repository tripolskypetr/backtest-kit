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

Opt-in: warm the 1m candle cache over the frame window in the PARENT before forking; downloads of all Worker.run calls are serialized by a global mutex and no child starts until every queued download completes. Default: false — the cache directory is cwd-relative and children run in their own ./job directories, so enable only when candles are read from a cwd-independent source
