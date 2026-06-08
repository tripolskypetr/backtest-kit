---
title: docs/type/CronCallback
group: docs
---

# CronCallback

```ts
type CronCallback = (info: IRuntimeInfo) => void | Promise<void>;
```

Callback signature for a cron entry handler.

Receives a single {@link IRuntimeInfo} snapshot assembled by
`RuntimeMetaService.getRuntimeInfo` at the moment the entry fires. It bundles
everything a handler typically needs — symbol, execution context, current
price, backtest range and the strategy-defined `info` payload — so the
handler does not have to re-query the meta-services itself.

Invocation cardinality depends on `entry.symbols` (see {@link CronEntry}):
- **Global mode** (`symbols` empty/undefined): invoked once per aligned
  boundary across all parallel backtests. The first symbol to reach the
  boundary opens the slot and runs the handler; others await the same
  promise.
- **Fan-out mode** (`symbols` non-empty): invoked once per aligned
  boundary **per whitelisted symbol**. Each symbol has its own slot.

Key fields of the {@link IRuntimeInfo} argument:
- `info.symbol` — In global mode: the symbol of the backtest that first
  reached the boundary (the singleshot "winner"). In fan-out mode: the
  whitelisted symbol whose tick produced this invocation.
- `info.context` — `{ strategyName, exchangeName, frameName }` taken from
  the originating lifecycle event (`beforeStart` / `idlePing` / `activePing`
  / `schedulePing`, wired by {@link CronUtils.enable}).
- `info.backtest` — Execution-mode flag from the same event. `true` for
  backtest runs, `false` for live. The value reflects the **opening** tick
  that won the singleshot for this slot — all parallel awaiters of the same
  slot observe the same value, even if a later concurrent tick carried a
  different one.
- `info.range` — Backtest frame range (`from`/`to`), or `null` in live mode.
- `info.currentPrice` — Current market price at snapshot time.
- `info.info` — Strategy-defined runtime payload (`IStrategySchema.info`),
  or `null` when the strategy declares none.
- `info.when` — Snapshot time. **Note:** this is the execution-context tick
  time captured by `getRuntimeInfo`, not the cron-aligned boundary. The
  aligned boundary still governs *when* the entry fires (and is used for the
  slot/dedup keys); `info.when` is the wall/virtual time of the underlying
  tick that opened the slot.
