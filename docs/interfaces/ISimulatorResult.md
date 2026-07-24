---
title: docs/interface/ISimulatorResult
group: docs
---

# ISimulatorResult

Final result of a simulation run: per-metric buckets, each with
its own reports, ranking winners and ban dictionaries — hits are
metric-dependent, any cross-metric aggregate would lie.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol the simulation ran for.

### ideasTotal

```ts
ideasTotal: number
```

Total ideas of the symbol received (including NEUTRAL).

### ideasDirectional

```ts
ideasDirectional: number
```

Directional ideas simulated (NEUTRAL and flood duplicates excluded).

### profileCount

```ts
profileCount: number
```

Number of idea profiles built (ideas with candle data).

### truncatedCount

```ts
truncatedCount: number
```

Profiles cut short by end of candle data.

### avgHoldMinutes

```ts
avgHoldMinutes: number
```

Mean holding time across all trades of every grid point, minutes.

### p95HoldMinutes

```ts
p95HoldMinutes: number
```

95th percentile of holding time across the whole grid, minutes.

### p99HoldMinutes

```ts
p99HoldMinutes: number
```

99th percentile of holding time across the whole grid, minutes — eternal holds are visible right in the run result.

### reports

```ts
reports: Record<SimulatorAuthorMetric, ISimulatorMetricReport>
```

Per-metric buckets keyed by the point's authorMetric. Every
metric key is always present — a metric absent from the swept
axis maps to an empty bucket.
