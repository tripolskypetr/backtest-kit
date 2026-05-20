---
title: docs/interface/IActivityEntry
group: docs
---

# IActivityEntry

Single entry tracking one in-flight backtest or live run.

Registered into the lookup map on activity start (e.g. `INSTANCE_TASK_FN` in
`Backtest`/`Live`, or per-strategy loop in `WalkerLogicPrivateService`) and
removed on completion or failure.

Used by `Candle.spinLock` to detect parallel workloads via {@link LookupUtils.isParallel}.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g. `"BTCUSDT"`).

### context

```ts
context: { strategyName: string; exchangeName: string; frameName?: string; }
```

Execution context identifying the running strategy.

### backtest

```ts
backtest: boolean
```

`true` for backtest activities, `false` for live activities.
