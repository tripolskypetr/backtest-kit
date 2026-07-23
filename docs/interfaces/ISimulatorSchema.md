---
title: docs/interface/ISimulatorSchema
group: docs
---

# ISimulatorSchema

Registration schema of a simulator instance.

Field-by-field contract — what each parameter allows to tune and
when it is ignored:
- simulatorName — registry key; duplicate registration is a
  validation error.
- exchangeName — candle source for idea profiles. The Exchange
  contract is strict (exactly `limit` candles or throw): end of
  history surfaces as an exception and becomes a truncated
  profile — truncated ideas are traded to the data edge but are
  IGNORED as ban-training evidence.
- gridAxes — PER-AXIS override merged over the engine defaults:
  an omitted axis takes the default LIST and is therefore swept;
  a single-value list freezes an axis. Pinning examples:
  authorMetric: ["close"] restores pre-reach ban training,
  banCriteria: ["sharpe"] restores the Sharpe-only run artifact,
  profitLockPercent: [0] disables the lock. Each axis documents
  its own tune/ignore conditions in ISimulatorGridAxes.
- callbacks — all optional; an omitted callback is simply never
  fired (silent run). onAuthorsTrained fires once per unique ban
  RULE (not per grid point) and never fires during test().

## Properties

### simulatorName

```ts
simulatorName: string
```

Unique simulator identifier for the schema registry.

### exchangeName

```ts
exchangeName: string
```

Exchange schema to fetch candles through.

### gridAxes

```ts
gridAxes: Partial<ISimulatorGridAxes>
```

Grid axes override, merged per-axis over the defaults at params
creation — a schema may override only the axes it cares about.

### reportOrder

```ts
reportOrder: SimulatorRankingCriterion
```

Ranking criterion ordering result.reports (descending). The
return value of run() is the consumer contract — callbacks are
a side channel — so the order of the flat report list is
declared here, not derived. Sorting uses the tie-guarded
comparator (naive subtraction breaks on Infinity
sortino/recovery of loss-free series). Default: "sharpe" —
bit-identical to the pre-knob behavior. Does not affect
best[], onRanking or banCriteria in any way.

### callbacks

```ts
callbacks: Partial<ISimulatorCallbacks>
```

Lifecycle callbacks (all optional).
