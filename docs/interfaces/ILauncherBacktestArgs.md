---
title: docs/interface/ILauncherBacktestArgs
group: docs
---

# ILauncherBacktestArgs

Launcher running every symbol through the backtest pipeline
(Backtest.background) over a historical frame window.

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

Warm the 1m candle cache over the frame window before launching. Default: true
